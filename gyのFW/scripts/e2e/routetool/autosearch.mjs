/**
 * autosearch·原语级分段 beam 搜索（02 号档 §1-§7 定稿设计的实现）。
 *
 * 机器自动探索通关：人给检查点链（entry/waypoints/target 断言组），机器逐段
 * beam 搜索双角色原语程序；段间种子传递 + seam 入场校验；全链通后以
 * botcore.drive 定稿重放收集事件表（唯一事实源）→ toRouteDoc → routes JSON，
 * 再过两阶段鲁棒验收（段级 inline 采样 → 整关 ±1f fatal=0 门 / ±2f 计数）。
 *
 * 用法:
 *   node --import tsx scripts/e2e/routetool/autosearch.mjs \
 *     --level forest_01 \
 *     --chain note/research/2026-10-autoplay/tools/checkpoints-forest_01.json \
 *     --beam 24 --budget 6000 --segs 0-8 --samples 10 \
 *     --out scripts/e2e/inputs/routes/forest_01.autosearch.json \
 *     --report note/research/2026-10-autoplay/tools/out/forest_01.autosearch.search.json \
 *     [--resume <search.json>] [--maxdepth N] [--maxminutes 50] [--verify <routes.json>]
 *
 * 设计要点（与 02 号档一一对应）：
 *   - 搜索内循环进程内全量重放（§1.4），live-worlds 不做（待决④）；
 *   - 评分 = 路标解锁×1000 + 目标 5000+早达·0.5 − shaping(下一未达路标,1.0)
 *     − 0.3·shaping(target) − 0.3·冻结帧 − 原语数 − 1e6·死亡（§4.1，E3 已验区分度）；
 *   - 交替扩展（深度差选角色）+ 前沿 beam + 程序签名去重 + 每角色深度上限（§4.2/§5）；
 *   - 组内断言同帧 AND、路标乱序兼容、waypoint/target 仅入场后计数（§3.1 三语义）；
 *   - seam 校验 = 段定稿终态直接断言下一段 entry，失败宽限 20f，再失败换种子/回滚（§9-3）；
 *   - 词表 = botcore S/S2 工厂直包 + autosearch 内部扩展（push/waitPx/waitPlat/waitProp），
 *     扩展原语只用 {f,w,me,other,mem,jumpHeld} 上下文面，保证与 drive 定稿重放零漂移
 *     （§1.3 边界约定；push 为待决②的 S6 词表补件，不改 botcore.mjs）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const kernel = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const botcore = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "botcore.mjs")).href);
const { makeWorld, expandFlat } = kernel;
const { NONE, S, S2, drive, toRouteDoc } = botcore;

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const hasFlag = (k) => argv.includes(`--${k}`);

if (hasFlag("help")) {
  console.log("见文件头注释。");
  process.exit(0);
}
const LEVEL = argOf("level", "forest_01");
const CHAIN_PATH = (() => {
  const p = argOf("chain", join(ROOT, "note", "research", "2026-10-autoplay", "tools", `checkpoints-${LEVEL}.json`));
  return isAbsolute(p) ? p : resolve(ROOT, p);
})();
const OUT_PATH = (() => {
  const p = argOf("out", join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.autosearch.json`));
  return isAbsolute(p) ? p : resolve(ROOT, p);
})();
const REPORT_PATH = (() => {
  const p = argOf("report", OUT_PATH.replace(/\.json$/, ".search.json"));
  return isAbsolute(p) ? p : resolve(ROOT, p);
})();
const BEAM = Number(argOf("beam", "24"));
const BUDGET = Number(argOf("budget", "6000"));           // 每段 evals 上限（§6）
const SAMPLES = Number(argOf("samples", "10"));            // 段级 inline 扰动采样组数（§4.3 阶段一）
const MAXMINUTES = Number(argOf("maxminutes", "50"));      // 整关墙钟软上限（预算护栏）
const SEAM_GRACE_F = Number(argOf("seamgrace", "20"));     // seam 入场宽限帧（§9-3）
const QUIET = hasFlag("quiet");
const segRange = (() => {
  const s = argOf("segs", "0-8");
  const [a, b] = s.split("-").map(Number);
  return [a, b === undefined ? a : b];
})();
const OVERRIDE_DEPTH = argOf("maxdepth") ? Number(argOf("maxdepth")) : null;

const log = (...a) => { if (!QUIET) console.log(...a); };

// ---------------------------------------------------------------- 断言编译（取数路径同 verify-chain.mjs，E1 已验证可计算）
// S = {fb:{x,y,vx,vy,grounded,dead}, wg:{...}}（dead = dead||dying，与 botcore.drive snapOf 同构）
// M = w.mechSnapshot()；D = {won, doors}
function compileGroup(list) {
  return list.map((a) => {
    switch (a.kind) {
      case "px": case "py": case "vx": {
        const k = a.kind === "px" ? "x" : a.kind === "py" ? "y" : "vx";
        return { a, f: (Sx, Mx) => Sx[a.role][k] >= a.min && Sx[a.role][k] <= a.max };
      }
      case "grounded": return { a, f: (Sx) => Sx[a.role].grounded };
      case "alive": return { a, f: (Sx) => !Sx.fb.dead && !Sx.wg.dead };
      case "leverState": return { a, f: (Sx, Mx) => Mx.levers[a.id].state === a.value };
      case "platY": return { a, f: (Sx, Mx) => Mx.platforms[a.id].y >= a.min && Mx.platforms[a.id].y <= a.max };
      case "platState": return { a, f: (Sx, Mx) => Mx.platforms[a.id].state === a.value };
      case "pusherState": return { a, f: (Sx, Mx) => Mx.pushers[a.id].state === a.value };
      case "propX": case "propY": {
        const k = a.kind === "propX" ? "x" : "y";
        return { a, f: (Sx, Mx) => Mx.props[a.id][k] >= a.min && Mx.props[a.id][k] <= a.max };
      }
      case "atDoor": return { a, f: (Sx) => Sx[a.role].atDoor };
      case "doorUp": return { a, f: (Sx, Mx, Dx) => Dx.doors[a.role === "fb" ? "fireboy" : "watergirl"].isUp };
      case "phaseWon": return { a, f: (Sx, Mx, Dx) => Dx.won };
      default: throw new Error(`未知断言 kind: ${a.kind}`);
    }
  });
}
const allS = (g, Sx, Mx, Dx) => g.every((c) => c.f(Sx, Mx, Dx));

// ---------------------------------------------------------------- 原语词表
// 标准件直包 botcore S/S2 工厂（搜索内循环与 drive 定稿重放运行同一份代码，零漂移）；
// 扩展件只用 drive 的 ctx 面 {f, w, me, other, mem, jumpHeld}（§1.3）。
// spec = {n: 名称, a: 参数数组}；PRIM_TABLE[n](...a) → step。程序 = 双角色 spec 列表。
// 方向约定：本文件词表用数值 ±1（+1=右），botcore S/S2 工厂用 "right"/"left"，在包装层翻译。
const ds = (d) => (d > 0 ? "right" : "left");
const PRIM_TABLE = {
  settle: (...a) => S.settle(...a),
  sleep: (...a) => S.sleep(...a),
  goTo: (...a) => S.goTo(...a),
  jump: (...a) => S.jump(...a),
  jumpDrift: (d, ...a) => S.jumpDrift(ds(d), ...a),
  jumpOnto: (d, ...a) => S.jumpOnto(ds(d), ...a),
  /** runJump 直包 + f0 护栏：character.currentRunForce 初始 undefined，首帧即压方向会算出 NaN 力
   *  永久毒化刚体（vx 冻结）。首帧返回 NONE 让 else 分支初始化 currentRunForce，f1 起正常。 */
  runJump: (d, ...a) => {
    const stp = S.runJump(ds(d), ...a);
    const orig = stp.run.bind(stp);
    let first = true;
    stp.run = (ctx) => { if (first) { first = false; return NONE; } return orig(ctx); };
    return stp;
  },
  brakedHop: (d, ...a) => S2.brakedHop(ds(d), ...a),
  edgeDrop: (d, ...a) => S2.edgeDrop(ds(d), ...a),
  /** 推箱（待决②）：持续压 dir 直到 props[propId] 质心到 untilX（box 落层/转弯由物理自然承接） */
  push: (dir, untilX, propId = 0) => {
    const D = dir > 0 ? "right" : "left";
    return {
      name: `push${dir}->${untilX}`,
      run: () => ({ ...NONE, [D]: true }),
      done: (c) => {
        const px = c.w.mechSnapshot().props[propId].x;
        return dir > 0 ? px >= untilX : px <= untilX;
      },
    };
  },
  /** 等另一角色进入 x 窗口（跨角色时序谓词，§5 备选 1 的 wait(pred) 形态；ctx.other 即对方） */
  waitPx: (role, min, max) => ({
    name: `wPx${role}${min}-${max}`,
    run: () => NONE,
    done: (c) => c.other.x >= min && c.other.x <= max,
  }),
  waitPlat: (id, minY, maxY) => ({
    name: `wPl${id}${minY}-${maxY}`,
    run: () => NONE,
    done: (c) => { const y = c.w.mechSnapshot().platforms[id]?.y; return y !== undefined && y >= minY && y <= maxY; },
  }),
  waitPropX: (id, min, max) => ({
    name: `wPo${id}${min}-${max}`,
    run: () => NONE,
    done: (c) => { const x = c.w.mechSnapshot().props[id]?.x; return x !== undefined && x >= min && x <= max; },
  }),
  /** 骑乘唤醒（S4 实证）：平台马达仅作用于清醒岛（deviceChanged 只 SetMotorSpeed，
   *  ApplyForce 不带 wake）；骑手站定后平台刚体入睡→永不升降。ride 以右偏往复输入
   *  （10f 右/6f 左，东墙 1216 挡住不滑出）保持骑手清醒，直到平台 y 进入窗口。 */
  ride: (id, minY, maxY) => {
    let t = 0;
    return {
      name: `ride${id}${minY}-${maxY}`,
      run: () => { t++; return t % 16 < 10 ? { ...NONE, right: true } : { ...NONE, left: true }; },
      done: (c) => { const y = c.w.mechSnapshot().platforms[id]?.y; return y !== undefined && y >= minY && y <= maxY; },
    };
  },
};
const spec = (n, ...a) => ({ n, a });
const stepOf = (sp) => PRIM_TABLE[sp.n](...sp.a);
const sigOf = (sf, sw) => JSON.stringify([sf, sw]);
const progNames = (spList) => spList.map((sp) => `${sp.n}(${sp.a.join(",")})`).join(" ");

// ---------------------------------------------------------------- 每段词表与搜索参数（forest_01，按实证地形与检查点链离散化）
// 地形全貌（瓦片实测 + 绿路线位置 trace 实证，2026-10-15 重建）：
//   底层 896 全宽连通但夹两条液体带（绿迹实证致死性）：x[576,736] 仅杀 wg（fb 趟水通过），
//   x[832,992] 仅杀 fb（wg 趟水通过）；704 台面嵌 x[768,928] 双杀带（双方必须跳越，绿迹双方空中越过）；
//   出生竖井 x[32,384] 上方有 768 台 x[0,384]，wg 生于其上（东缘走落）；
//   704 台 x[512,1088]（连续，无缺口）；640 廊 x[0,576]；672 檐 x[480,608]；杠杆 l0 杆体 @廊下 (304,~700)，
//   廊上西行过 x≈296-312 即物理拨杆翻转（绿迹 f560 实证）；P1 升降台 x[32,160]，顶 480(起)↔576(沉)，
//   沉位在廊面上方 64px（廊上跳可登）；480 台 x[128,640] 顶480；512 廊 x[576,1216] 顶512；
//   P0 升降台 x[1088,1216]，顶 384(起)↔480(沉)，group5=b0|b1 压住下行；384 台阶 x[896,1088] 顶384；
//   352 板 x[0,1088] 顶352；b0 板下 (960,384)（中心口径，箱 x928-992×y352-416，板上站立即压）；b1 480 台下 (320,512)；
//   288 块 x[640,928] 顶288（箱 64px 置于块顶，中心(736,256)，推落西缘后落板中心高 320）；
//   西塔 x[0,192] 顶224（板 317 跳箱顶 253 再跳塔 189，两跳各 64px）；顶层 192 x[352,1216]（门 fb~1056 wg~1168）。
//   站立体心 ≈ 面−35px；满速跳距 ~250px，净跳高 ~106px（E3 实测）。绿路线仅作参数校准参照（非事件素材）。
const SEG = {
  S0a: {
    maxDepth: 16, capFb: 9, capWg: 8,
    vocab: {
      // fb：底层东行趟过 wg 敏感带 [576,736] → 满速跳过 fb 敏感带 [832,992]（线 ~830，落 ~1060）
      //   → 紧接跳上 800 塔（升 96px）→ 塔顶西跳上 704 台东段（落 ~950-1100）
      fb: [spec("runJump", 1, 800), spec("runJump", 1, 830), spec("runJump", 1, 1080), spec("runJump", 1, 1100),
        spec("runJump", 1, 1120), spec("runJump", -1, 1150), spec("runJump", -1, 1180), spec("jumpDrift", -1, 0, 60),
        spec("sleep", 15)],
      // wg：768 台东行走落（落点 ~480-500，带前安全）→ 落地即跳过 wg 敏感带（落 ~730-760）
      //   → 趟过 fb 敏感带 → 跳上 800 塔就位
      wg: [spec("runJump", 1, 460), spec("runJump", 1, 480), spec("runJump", 1, 500), spec("runJump", 1, 1080),
        spec("runJump", 1, 1100), spec("goTo", 1180, 12), spec("goTo", 1200, 10), spec("sleep", 15)],
    },
  },
  S0b: {
    maxDepth: 12, capFb: 8, capWg: 8,
    vocab: {
      // fb：台面西行蓄速 → ~950 起跳越过双杀带 [768,928]（落 ~660-720）→ 西行过台西端（512 落 640 廊）
      //   → 廊上就位（勿停杆区 296-312，防误翻 l0）
      fb: [spec("runJump", -1, 950), spec("runJump", -1, 975), spec("runJump", -1, 925), spec("jumpDrift", -1, 0, 90),
        spec("goTo", 420, 12), spec("goTo", 380, 12), spec("goTo", 460, 12), spec("sleep", 15)],
      // wg：塔顶西跳上台东段（落 ~1030-1120，带东侧安全）→ 西行蓄速 → ~950 跳越双杀带 → 西行落廊就位
      wg: [spec("runJump", -1, 1180), spec("runJump", -1, 1160), spec("runJump", -1, 950), spec("runJump", -1, 930),
        spec("jumpDrift", -1, 0, 90), spec("goTo", 500, 12), spec("goTo", 450, 12), spec("sleep", 15)],
    },
  },
  S1: {
    maxDepth: 14, capFb: 8, capWg: 8, horizonF: 450,
    // 登板宏（dbg15 实证，2026-10-16）：西行触发区 [272,336]（任一角色进入即翻转 l0），
    // P1(obj33 x[32,160]) 沉降 496→592 约 97f 且驻留；fb 西行被 P1 东立面(160)顶死在
    // [175.6,604.5]——rj 起跳线 150 永不可达（队列搁浅）。贴脸 jo(-1,546)：apex feet≈549
    // 越过板顶 576，y<546 左漂越立面落板顶 ~155，再 go48 西行至 px[24,72]。
    // waitPlat 先行（s1r5 教训）：宏里边走边沉会撞上静台阶爬行-坠落弧（inline 10/20 全聚在
    // f731-740 与 f536-590 连锁）；等板沉定（状态锚定，天然吸收 wg 过杆 ±1f）再走，走位/
    // 登板全程无时序耦合。horizon 450：metAt ~f895（segF 374）超出旧 300。
    recipe: {
      fb: [spec("waitPlat", 1, 586, 600), spec("goTo", 176, 8), spec("jumpOnto", -1, 546), spec("goTo", 48, 12), spec("sleep", 30)],
      wg: [spec("goTo", 200, 12), spec("sleep", 15)],
    },
    vocab: {
      // fb：廊上西行过杆（x≈304 翻转 l0 → P1 下沉 90f）→ 续西 → 跳上西行登 P1 沉位 → 西行贴墙
      //   waitPlat：新 seam（full-rob5 S0b trim9/8）下 fb 登板与 P1 沉位周期的时序耦合失配
      //   （v5 d10 前沿耗尽 wp2/2 未 met），等板到位再跳解耦
      fb: [spec("goTo", 250, 10), spec("goTo", 230, 10), spec("goTo", 180, 12), spec("goTo", 150, 12),
        spec("jumpDrift", -1, 0, 60), spec("jumpDrift", -1, 0, 80), spec("jumpOnto", -1, 555), spec("jumpOnto", -1, 570),
        spec("waitPlat", 1, 580, 600), spec("runJump", -1, 150), spec("runJump", -1, 170),
        spec("goTo", 60, 12), spec("goTo", 48, 12), spec("sleep", 15)],
      wg: [spec("goTo", 200, 12), spec("goTo", 170, 12), spec("goTo", 240, 12), spec("goTo", 150, 12), spec("sleep", 15)],
    },
  },
  S2: {
    maxDepth: 10, capFb: 7, capWg: 6,
    vocab: {
      // fb：P1 西缘原地跳东上 480 台（升 ~96px，绿迹同款无助跑跳）；wg 接位 P1 西缘
      fb: [spec("jumpDrift", 1, 0, 90), spec("jumpDrift", 1, 0, 70), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475),
        spec("runJump", 1, 60), spec("runJump", 1, 100), spec("goTo", 200, 12), spec("goTo", 300, 12), spec("sleep", 15)],
      wg: [spec("goTo", 120, 12), spec("goTo", 100, 12), spec("jumpOnto", -1, 555), spec("jumpOnto", -1, 570),
        spec("jumpDrift", -1, 0, 40), spec("goTo", 60, 12), spec("goTo", 48, 12), spec("sleep", 15)],
    },
  },
  S3: {
    maxDepth: 12, capFb: 6, capWg: 8,
    vocab: {
      // fb：480 台东行 → 东缘落 512 廊 → 东行候乘
      fb: [spec("goTo", 500, 12), spec("goTo", 650, 12), spec("goTo", 800, 12), spec("goTo", 1060, 12),
        spec("goTo", 1090, 12), spec("sleep", 15)],
      // wg：P1 西缘跳东上 480 台 → 东行压 b1（P0 下行）
      wg: [spec("jumpDrift", 1, 0, 90), spec("jumpDrift", 1, 0, 70), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475),
        spec("runJump", 1, 60), spec("runJump", 1, 100), spec("goTo", 352, 8), spec("goTo", 345, 8),
        spec("goTo", 360, 8), spec("sleep", 15)],
    },
  },
  S4: {
    maxDepth: 14, capFb: 12, capWg: 5,
    vocab: {
      // 实证（probe4，2026-10-15）：fb 廊上东行靠 P0 沉位西立面（x~1076，顶 480 高廊面 32px 为台）；
      //   板下台阶 y[384,416] 把净空压到 29px → 登乘只能立面垂直跳（jo 顶头截断+下落东漂上 P0）；
      //   wg 松 b1 后 P0 载 fb 升顶须 fb 骑乘唤醒（ride）；顶 384 比板 352 低 32px，跳西落板压 b0。
      fb: [spec("goTo", 1080, 12), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475), spec("ride", 0, 396, 412),
        spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 25), spec("goTo", 970, 10), spec("goTo", 992, 10),
        spec("sleep", 60)],
      wg: [spec("sleep", 30), spec("waitPx", "fb", 1080, 1214), spec("goTo", 1060, 12), spec("goTo", 1100, 12),
        spec("sleep", 15)],
    },
  },
  S5: {
    maxDepth: 14, capFb: 8, capWg: 12,
    vocab: {
      // fb：先走回 b0 上方再压站（种尾截断的 jd 会让 fb 多跳一步离箱，需回位）→ 候 wg 登 P0
      //   （b0 已压）→ 离 b0 西跳上 288 块（P0 载 wg 升）→ 块顶西行（自然推箱随行）
      fb: [spec("goTo", 970, 10), spec("goTo", 992, 10), spec("sleep", 30), spec("waitPx", "wg", 1080, 1214),
        spec("jumpDrift", -1, 0, 30), spec("jumpDrift", -1, 0, 50),
        spec("jumpOnto", -1, 290), spec("goTo", 740, 12), spec("goTo", 750, 12), spec("goTo", 700, 12), spec("goTo", 650, 12), spec("sleep", 15)],
      // wg：东行靠 P0 沉位立面（go 1080 同 S4 fb 实证，1100 被立面顶住永不达）→ 立面跳登乘
      //   → 骑乘唤醒升至顶 → 平台东端就位（launch 点远，跳西弧线才越过板立面 x1088，探针实证）
      //   → 跳西上板 → 东缘步级跳上 288 块 → 西行就位
      wg: [spec("goTo", 1080, 12), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475), spec("ride", 0, 396, 412),
        spec("goTo", 1190, 12), spec("jumpDrift", -1, 0, 50), spec("runJump", -1, 1100),
        spec("jumpDrift", -1, 0, 70), spec("goTo", 950, 10), spec("jumpDrift", -1, 0, 30),
        spec("jumpDrift", -1, 0, 50), spec("jumpOnto", -1, 290), spec("goTo", 800, 12), spec("sleep", 15)],
    },
  },
  S6: {
    maxDepth: 16, capFb: 9, capWg: 9, horizonF: 700, // 推箱+双跳登塔超出链 340 口径，搜索层放宽（断言窗不变）
    vocab: {
      // fb：箱东持续西推（push，待决②词表）至 240（推落块缘自动落板）→ 跳上箱顶 → 跳上西塔 → 塔顶满速东跳（目标窗空中命中）
      fb: [spec("push", -1, 240, 0), spec("push", -1, 280, 0), spec("goTo", 310, 10), spec("jumpDrift", -1, 0, 25),
        spec("jumpDrift", -1, 0, 40), spec("runJump", 1, 150), spec("runJump", 1, 170),
        spec("jumpOnto", -1, 120), spec("sleep", 15)],
      wg: [spec("goTo", 400, 12), spec("goTo", 340, 10), spec("goTo", 310, 10), spec("push", -1, 240, 0),
        spec("jumpDrift", -1, 0, 25), spec("jumpDrift", -1, 0, 40), spec("runJump", 1, 150), spec("sleep", 15)],
    },
  },
  S7: {
    maxDepth: 12, capFb: 7, capWg: 7,
    vocab: {
      // 实证（dbg7-dbg9 探针 + 瓦片 r4-r6 dump + 绿迹 f2040-2150 双验证，2026-10-16）：
      //   种子终态（S6 停泊重放）fb 箱顶 [215,253]G、wg 352 板 [293,317]G。顶层真通道：
      //   西塔(224)东缘满速助跑跳（空中持续压右加速至 vx287，飞行 ~300px）→ 台阶B顶
      //   (128, x[320,416]) → 东落顶层(192, x≥384) → 东行走门。箱顶站跳弧线顶点 feet~168
      //   差 40px 越不过台阶B西立面（dbg9 实证撞墙滑落板），必须先回塔。
      //   fb: 箱顶西跳回塔（升 64px）→ 塔上助跑跳；wg: 板西跳上箱 → 箱顶西跳回塔 → 同款。
      fb: [spec("jumpDrift", -1, 0, 40), spec("jumpDrift", 1, 0, 50), spec("runJump", 1, 150), spec("runJump", 1, 170),
        spec("runJump", 1, 185), spec("runJump", 1, 190), spec("goTo", 700, 12), spec("goTo", 900, 12),
        spec("goTo", 1056, 8), spec("goTo", 1050, 8), spec("sleep", 15)],
      wg: [spec("jumpDrift", -1, 0, 30), spec("jumpDrift", -1, 0, 40), spec("jumpDrift", 1, 0, 50), spec("runJump", 1, 150),
        spec("runJump", 1, 170), spec("runJump", 1, 185), spec("runJump", 1, 190),
        spec("goTo", 1168, 8), spec("goTo", 1160, 8), spec("sleep", 15)],
    },
  },
};

// ---------------------------------------------------------------- evaluate：单候选全量重放（进程内确定性，§1.4）
// 语义对齐 botcore.drive（fb→wg→step，run→done→推进，队列空锁存末输入，死亡/WIN 短路），
// 另加：entry 联合首帧（入场门控）、段相对 horizon、双队列空+宽限冻结。
function evaluate(segC, sf, sw, totalCapF) {
  const w = makeWorld(LEVEL);
  const progs = { fb: sf.map(stepOf), wg: sw.map(stepOf) };
  const idx = { fb: 0, wg: 0 };
  const state = { fb: { ...NONE }, wg: { ...NONE } };
  const snapOf = (role) => {
    const s = w.snapshotPlayer(role);
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, atDoor: s.atDoor, grounded: w.players[role].feetContacts.length > 0, dead: s.dead || s.dying };
  };
  const wpMetF = segC.wpG.map(() => -1);
  let entryF = -1, deathF = -1, deadWho = null, metAt = -1, wonAt = -1, endF = 0;
  let lastQueueEmptyF = -1;
  let metIdx = null;
  const inputs = { fb: NONE, wg: NONE };
  const drainF = { fb: -1, wg: -1 }; // 各侧队列排干帧（seam 判据用：移动中的角色入窗须发生在排干前，排干后 adds 即扰动）
  let entryS = null;                 // 入窗帧状态（seam 判据取 vx：站立侧豁免排干前约束）
  for (let f = 0; f < totalCapF; f++) {
    const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
    const idxSnap = { fb: idx.fb, wg: idx.wg }; // 本帧将执行的原语下标（done 推进前）
    for (const role of ["fb", "wg"]) {
      const stp = progs[role][idx[role]];
      // 队列空 = 锁存末输入（对齐 botcore.drive/验收内核；复位 NONE 会让搜索期 met
      // 与定稿 drive 重放不一致——S7 实证：goTo 末件锁存 right 走出门区，WIN 掉门）
      if (!stp) continue;
      const ctx = {
        f, w, me: meS[role], other: meS[role === "fb" ? "wg" : "fb"],
        mem: (stp._mem ??= {}),
        jumpHeld: state[role].up,
      };
      let inp = null;
      try { inp = stp.run(ctx); } catch { inp = NONE; }
      const next = { up: !!(inp?.up), left: !!(inp?.left), right: !!(inp?.right) };
      state[role] = next;
      inputs[role] = next;
      let d = false;
      try { d = stp.done(ctx); } catch { d = false; }
      if (d) { idx[role]++; if (idx[role] >= progs[role].length) drainF[role] = f; }
    }
    w.step(1 / 60, { fireboy: inputs.fb, watergirl: inputs.wg });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) {
      deathF = f; deadWho = (a.dead || a.dying ? "fb" : "wg") + "@[" + (a.dead || a.dying ? a.x : b.x).toFixed(0) + "," + (a.dead || a.dying ? a.y : b.y).toFixed(0) + "]";
      endF = f; break;
    }
    // 断言取 step 后状态（verify-chain.mjs/E1 同口径：step→逐帧联合求值）
    const Sx = {
      fb: { x: a.x, y: a.y, vx: a.vx, vy: a.vy, atDoor: a.atDoor, grounded: w.players.fireboy.feetContacts.length > 0, dead: a.dead || a.dying },
      wg: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, atDoor: b.atDoor, grounded: w.players.watergirl.feetContacts.length > 0, dead: b.dead || b.dying },
    };
    const Mx = w.mechSnapshot();
    const Dx = { won: w.phase === "won", doors: w.doors };
    if (entryF < 0 && allS(segC.entryG, Sx, Mx, Dx)) { entryF = f; entryS = Sx; }
    if (entryF >= 0) {
      const segF = f - entryF;
      for (let wi = 0; wi < segC.wpG.length; wi++) if (wpMetF[wi] < 0 && allS(segC.wpG[wi], Sx, Mx, Dx)) wpMetF[wi] = segF;
      if (metAt < 0 && allS(segC.targetG, Sx, Mx, Dx)) { metAt = segF; metIdx = { ...idxSnap }; endF = f; break; }
      if (segF >= segC.horizonF) { endF = f; break; }                    // 段超时冻结
      // 双队列空：再给 GRACE 帧看残余物理（平台滑行/落体），仍不达则冻结
      const queuesEmpty = idx.fb >= progs.fb.length && idx.wg >= progs.wg.length;
      if (queuesEmpty) {
        if (lastQueueEmptyF < 0) lastQueueEmptyF = f;
        else if (f - lastQueueEmptyF >= GRACE_F) { endF = f; break; }
      } else lastQueueEmptyF = -1;
    }
    if (w.phase === "won") { wonAt = f; endF = f; break; }
  }
  if (endF === 0 && deathF < 0 && metAt < 0 && wonAt < 0) endF = totalCapF - 1;
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  const Send = {
    fb: { x: a.x, y: a.y, vx: a.vx, vy: a.vy, atDoor: a.atDoor, grounded: w.players.fireboy.feetContacts.length > 0, dead: a.dead || a.dying },
    wg: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, atDoor: b.atDoor, grounded: w.players.watergirl.feetContacts.length > 0, dead: b.dead || b.dying },
  };
  return {
    deathF, deadWho, entryF, entryS, wpMetF, metAt, wonAt, endF, metIdx, drainF, idxEnd: { fb: idx.fb, wg: idx.wg },
    S: Send, M: w.mechSnapshot(),
    D: { won: w.phase === "won", doors: { fireboy: { isUp: w.doors.fireboy.isUp }, watergirl: { isUp: w.doors.watergirl.isUp } } },
  };
}
const GRACE_F = Number(argOf("grace", "25"));
const ROB_TOP = Number(argOf("robtop", "14"));         // 层内鲁棒采样候选数（0=关闭，退回纯前沿分）
const ROB_SAMPLES = Number(argOf("robsamples", "6"));  // 每候选 ±1f 采样组数
const ROB_W = Number(argOf("robw", "2000"));           // fatal 率折分权重（满脆 −ROB_W，量级=2 路标解锁）

// ---------------------------------------------------------------- scoreOf（§4.1，E3 v2 同式）
function scoreOf(segC, sf, sw, r) {
  if (r.deathF >= 0) return { score: -1e6, unlocked: 0, met: false };
  const entryF = r.entryF >= 0 ? r.entryF : 0;
  const unlocked = r.wpMetF.filter((x) => x >= 0).length;
  const met = r.metAt >= 0 || r.wonAt >= 0;
  const segEnd = r.metAt >= 0 ? r.metAt : (r.endF - entryF);
  let s = unlocked * 1000 + (met ? 5000 + 0.5 * (segC.horizonF - (r.metAt >= 0 ? r.metAt : segC.horizonF)) : 0);
  if (!met) {
    const wi = r.wpMetF.findIndex((x) => x < 0);
    const next = wi >= 0 ? segC.wpG[wi] : segC.targetG;
    for (const c of next) {
      if (c.a.kind === "px") s -= Math.abs((c.a.role === "fb" ? r.S.fb.x : r.S.wg.x) - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "py") s -= 2 * Math.abs((c.a.role === "fb" ? r.S.fb.y : r.S.wg.y) - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "propX") s -= Math.abs(r.M.props[c.a.id].x - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "propY") s -= 2 * Math.abs(r.M.props[c.a.id].y - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "platY") s -= Math.abs(r.M.platforms[c.a.id].y - (c.a.min + c.a.max) / 2);
    }
    for (const c of segC.targetG) {
      if (c.a.kind === "px") s -= 0.3 * Math.abs((c.a.role === "fb" ? r.S.fb.x : r.S.wg.x) - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "py") s -= 0.6 * Math.abs((c.a.role === "fb" ? r.S.fb.y : r.S.wg.y) - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "propX") s -= 0.3 * Math.abs(r.M.props[c.a.id].x - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "propY") s -= 0.6 * Math.abs(r.M.props[c.a.id].y - (c.a.min + c.a.max) / 2);
    }
    s -= Math.max(0, segEnd) * 0.3;
  }
  s -= (sf.length + sw.length);
  return { score: s, unlocked, met };
}

// ---------------------------------------------------------------- replayEvents：botcore.drive 定稿重放收事件表（唯一事实源，§1.3）
function replayEvents(sf, sw, totalFrames) {
  const w = makeWorld(LEVEL);
  const r = drive(w, { fb: sf.map(stepOf), wg: sw.map(stepOf) }, totalFrames);
  return r;
}

// ---------------------------------------------------------------- inline 扰动采样（§4.3 阶段一）
// 对候选事件表做 R 组随机扰动（每组随机 1 事件平移 ±1f），重放判 fatal（死亡或 deadline 内 target 未达）。
// minF：只采样 f≥minF 的事件（链式搜索下前缀事件已冻结，均匀罚全候选无区分度；
// 本段新增事件的 ±1f 脆弱度才是本层可控量——s7j 全链 365/614 诊断结论）。
function inlineSample(baseEvents, segC, deadlineAbsF, R, minF = 0, requireMet = true) {
  const evs = { fb: baseEvents.fb, wg: baseEvents.wg };
  const all = [];
  for (const side of ["fb", "wg"]) for (let i = 0; i < evs[side].length; i++) { if (evs[side][i].f < minF) continue; all.push({ side, i }); }
  if (!all.length) return { fatal: 0, groups: [] };
  let fatal = 0;
  const groups = [];
  for (let g = 0; g < R; g++) {
    const pick = all[Math.floor(Math.random() * all.length)];
    const dir = Math.random() < 0.5 ? -1 : 1;
    const T = { fb: evs.fb.map((e) => ({ ...e })), wg: evs.wg.map((e) => ({ ...e })) };
    T[pick.side][pick.i].f += dir;
    const ok = replayEventRoute(T, segC, deadlineAbsF, requireMet);
    if (!ok) { fatal++; groups.push({ side: pick.side, i: pick.i, f: evs[pick.side][pick.i].f, dir }); }
  }
  return { fatal, groups };
}
/** 扰动事件表回放：requireMet=true 时死亡或 deadlineAbsF 内 target 未达 → false；
 *  false 时仅死亡判 fatal（层内非 met 候选的存活鲁棒度判据，到 deadline 仍活着即通过） */
function replayEventRoute(T, segC, deadlineAbsF, requireMet = true) {
  const w = makeWorld(LEVEL);
  const ins = expandFlat(T.fb, T.wg, deadlineAbsF + 2);
  let met = false;
  for (let f = 0; f <= deadlineAbsF; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) return false;
    const Sx = {
      fb: { x: a.x, y: a.y, vx: a.vx, vy: a.vy, atDoor: a.atDoor, grounded: w.players.fireboy.feetContacts.length > 0, dead: a.dead || a.dying },
      wg: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, atDoor: b.atDoor, grounded: w.players.watergirl.feetContacts.length > 0, dead: b.dead || b.dying },
    };
    const Mx = w.mechSnapshot();
    const Dx = { won: w.phase === "won", doors: w.doors };
    if (allS(segC.targetG, Sx, Mx, Dx)) { met = true; break; }
  }
  return requireMet ? met : true;
}

// ---------------------------------------------------------------- 主流程
const chain = JSON.parse(readFileSync(CHAIN_PATH, "utf8"));
if (chain.level !== LEVEL) { console.error(`chain.level=${chain.level} 与 --level ${LEVEL} 不符`); process.exit(2); }

/** 段定义 → 编译后 segC（SEG 表可覆盖 horizonF，如 S6 推箱段；断言窗不变） */
function segCtxOf(def) {
  const ovr = SEG[def.id] ?? {};
  return {
    id: def.id, title: def.title, horizonF: ovr.horizonF ?? def.horizonF,
    entryG: compileGroup(def.entry),
    wpG: (def.waypoints ?? []).map(compileGroup),
    targetG: compileGroup(def.target),
  };
}

/** 单段 beam 搜索。seeds: [{sf, sw}]（上一段定稿程序前缀）。返回搜索结果对象。 */
function searchSegment(segDef, seeds, opts) {
  const segC = segCtxOf(segDef);
  const cfg = SEG[segDef.id] ?? { maxDepth: 10, capFb: 8, capWg: 8, vocab: null };
  if (!cfg.vocab) throw new Error(`段 ${segDef.id} 无词表（SEG 表缺）`);
  const maxDepth = OVERRIDE_DEPTH ?? cfg.maxDepth;
  const capFb = cfg.capFb, capWg = cfg.capWg;
  const t0 = Date.now();
  const layers = [];
  const seen = new Set();
  let evals = 0, solved = null, bestEver = null;
  let metBeam = null; // 首个产出 met 候选的层前沿（早熟家系 seam 不过时继续搜，此快照供定稿兜底）
  // 总重放上限：种子程序长度估计 + horizon + 宽限（前缀帧数以种子 endF 为准，由调用方传入 opts.prefixF）
  const prefixF = opts.prefixF ?? 0;
  const totalCapF = prefixF + segC.horizonF + GRACE_F + 120;
  let beam = seeds.map((sd) => ({ sf: sd.sf, sw: sd.sw }));
  // cap 语义：本段【新增】原语数（不含链式种子长度）——种子逐段增长，绝对上限必然死锁
  const seedFb = Math.max(...seeds.map((sd) => sd.sf.length));
  const seedWg = Math.max(...seeds.map((sd) => sd.sw.length));
  let exhausted = false;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const cands = [];
    let deadKept = [];
    // recipe 宏候选（cfg.recipe）：d1 直接种子+整组宏注入一次，评估/评分与词表候选同轨
    if (depth === 1 && cfg.recipe) {
      const sf2 = [...beam[0].sf, ...cfg.recipe.fb];
      const sw2 = [...beam[0].sw, ...cfg.recipe.wg];
      const sig = sigOf(sf2, sw2);
      if (!seen.has(sig)) {
        seen.add(sig);
        const r = evaluate(segC, sf2, sw2, totalCapF);
        evals++;
        const sc = scoreOf(segC, sf2, sw2, r);
        const cand = { sf: sf2, sw: sw2, ...sc, r };
        if (r.deathF >= 0) deadKept.push(cand); else cands.push(cand);
        log(`  ${segDef.id} d${depth}: recipe 宏 evals=${evals} score=${sc.score.toFixed(0)} wp=${sc.unlocked}/${segC.wpG.length} met=${sc.met} death@${r.deathF} entry@${r.entryF}`);
      }
    }
    for (const node of beam) {
      const dFb = node.sf.length, dWg = node.sw.length;
      let role = dFb > dWg ? "wg" : dWg > dFb ? "fb" : (depth % 2 ? "fb" : "wg");
      const capped = (rl) => (rl === "fb" && dFb - seedFb >= capFb) || (rl === "wg" && dWg - seedWg >= capWg);
      // 所属侧 cap 满则换另一侧扩展（否则整层空转假耗尽——S1 capWg5 实证 d10 全员 skip）
      if (capped(role)) role = role === "fb" ? "wg" : "fb";
      if (capped(role)) continue;
      for (const prim of cfg.vocab[role]) {
        const sf2 = role === "fb" ? [...node.sf, prim] : node.sf;
        const sw2 = role === "wg" ? [...node.sw, prim] : node.sw;
        const sig = sigOf(sf2, sw2);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const r = evaluate(segC, sf2, sw2, totalCapF);
        evals++;
        const sc = scoreOf(segC, sf2, sw2, r);
        const cand = { sf: sf2, sw: sw2, ...sc, r };
        if (r.deathF >= 0) { deadKept.push(cand); continue; }
        cands.push(cand);
      }
    }
    if (!cands.length) {
      if (!deadKept.length) { log(`  ${segDef.id} d${depth}: 前沿耗尽（深度上限/词表空转）`); exhausted = true; break; }
      deadKept.sort((x, y) => y.r.deathF - x.r.deathF);
      beam = deadKept.slice(0, 3).map((c) => ({ ...c, score: -1e5 + c.r.deathF })); // 全灭层软回退（§4.1）
      log(`  ${segDef.id} d${depth}: 全灭层（最晚死者 ${deadKept[0].r.deadWho}@f${deadKept[0].r.deathF}）→ 软回退 3 候选`);
      continue;
    }
    cands.sort((x, y) => y.score - x.score);
    // 鲁棒度入环（§4.3 阶段一前移到层内）：前沿 top-ROB_TOP 候选做本段事件 ±1f 采样，
    // fatal 率折分后重排。动机（s7j 全链诊断）：事件表绝对帧锚定 vs 程序状态锚定的
    // 错位逐段放大——S0a-S3 事件 70-75% ±1f fatal、死亡点集中在 S7 窄窗（110/365），
    // 层内不淘汰脆谱系，末端必然组装出纸牌屋。met 候选判"扰动后仍达标"，
    // 非 met 候选判"扰动后仍存活"（target 未达是常态，不能按未达罚）。
    if (ROB_TOP > 0) {
      for (const c of cands.slice(0, Math.min(ROB_TOP, cands.length))) {
        if (c.r.entryF < 0) { c.rob = null; continue; }
        const dr = replayEvents(c.sf, c.sw, Math.max(1, c.r.endF) + 2);
        const deadlineAbsF = c.r.entryF + segC.horizonF;
        const ins = inlineSample(dr.events, segC, deadlineAbsF, ROB_SAMPLES, c.r.entryF, !!c.met);
        c.rob = { fatal: ins.fatal, n: ROB_SAMPLES };
        c.score -= ROB_W * (ins.fatal / ROB_SAMPLES);
      }
      cands.sort((x, y) => y.score - x.score);
    }
    beam = cands.slice(0, BEAM); // 仅前沿 beam（E3 定版：时长惩罚使父代恒优于子代，同池会耗尽前沿）
    const b = beam[0];
    if (!bestEver || b.score > bestEver.score) bestEver = b;
    layers.push({
      depth, evals, best: +b.score.toFixed(0), unlocked: b.unlocked, met: b.met,
      rob: b.rob ? `${b.rob.fatal}/${b.rob.n}` : null,
      entryF: b.r.entryF, endF: b.r.endF,
      fb: [+b.r.S.fb.x.toFixed(0), +b.r.S.fb.y.toFixed(0)], wg: [+b.r.S.wg.x.toFixed(0), +b.r.S.wg.y.toFixed(0)],
      path: progNames(b.sf).slice(0, 160) + " | " + progNames(b.sw).slice(0, 160),
    });
    log(`  ${segDef.id} d${depth}: evals=${evals} best=${b.score.toFixed(0)} wp=${b.unlocked}/${segC.wpG.length} met=${b.met} rob=${layers.at(-1).rob ?? "-"} entry@${b.r.entryF} fb=[${layers.at(-1).fb}] wg=[${layers.at(-1).wg}]`);
    if (b.met) {
      // met 不即停：先试定稿阶梯，seam 过关才收（早熟脆家系 met 会饿死下段——v4 实证
      // d8 4原语落窗即坠家系抢跑）；不过则继续加深让鲁棒家系上位，快照首个 met 前沿兜底
      const finTry = finalizeSegment({ beam }, segDef, prefixF, opts.nextDef ?? null);
      if (finTry && (finTry.seamEntryF >= 0 || !opts.nextDef)) { solved = b; break; }
      if (!metBeam) metBeam = beam;
    }
    if (evals > BUDGET) { log(`  ${segDef.id} evals 预算耗尽（${BUDGET}）`); exhausted = true; break; }
    if ((Date.now() - opts.t0) / 1000 > opts.wallBudgetS) { log(`  ${segDef.id} 墙钟预算耗尽`); exhausted = true; break; }
  }
  if (!solved && metBeam) { solved = metBeam.find((n) => n.met) ?? null; beam = metBeam; }
  return {
    id: segDef.id, title: segDef.title, horizonF: segC.horizonF, maxDepth,
    solved: !!solved, exhausted, evals, wallS: +((Date.now() - t0) / 1000).toFixed(1), layers,
    bestEver: bestEver ? { score: +bestEver.score.toFixed(0), unlocked: bestEver.unlocked, met: bestEver.met, entryF: bestEver.r.entryF, endF: bestEver.r.endF, fb: [+bestEver.r.S.fb.x.toFixed(0), +bestEver.r.S.fb.y.toFixed(0)], wg: [+bestEver.r.S.wg.x.toFixed(0), +bestEver.r.S.wg.y.toFixed(0)], sf: bestEver.sf, sw: bestEver.sw } : null,
    solvedCand: solved ? { score: +solved.score.toFixed(0), unlocked: solved.unlocked, entryF: solved.r.entryF, endF: solved.r.endF, metAt: solved.r.metAt, sf: solved.sf, sw: solved.sw, S: solved.r.S, M: solved.r.M, D: solved.r.D } : null,
    beam: beam.filter((n) => n.r).slice(0, 6).map((n) => ({ score: +n.score.toFixed(0), met: !!n.met, unlocked: n.unlocked ?? n.r.unlocked, entryF: n.r.entryF, endF: n.r.endF, metAt: n.r.metAt, metIdx: n.r.metIdx, sf: n.sf, sw: n.sw, S: n.r.S, M: n.r.M, D: n.r.D })),
  };
}

/** 段定稿：beam 前 8 达标者，各做【修剪深度阶梯】+ drive 重放收事件表 + inline 采样 + 下段 entry 实测，
 *  按（seam 通过, score′）字典序定稿（§4.3 阶段一）。
 *  修剪深度阶梯（S0b 饥饿实证）：泊位修剪剪掉 metAt 在飞原语，其弧线可能正是下段 entry
 *  的入窗穿越（S0a d9 解的 fb 第 5 原语 runJump(-1,1150) 即入窗弧线，剪掉后 fb 撞东墙
 *  坠落永不过窗）；故 metIdx 剪（S5 泊位，防悬空谓词阻塞队列）不过关时逐级多保留 1-3
 *  个原语重试，末级不剪兜底。每级以「下段 entry 实测 + 队列排干（idxEnd=长度，防保留
 *  永不完成的原语重新引入 S5 阻塞）」双检。 */
function finalizeSegment(segRes, segDef, prefixF, nextDef) {
  const segC = segCtxOf(segDef);
  const nextC = nextDef ? segCtxOf(nextDef) : null;
  const pool = segRes.beam.filter((n) => n.met).slice(0, 8);
  const out = [];
  for (const node of pool) {
    // 活前沿节点字段在 .r 里（报表 beam 才是摊平形状）——不归一化则 metIdx 恒 undefined，
    // 阶梯退化为只试全长（d43e739 上线以来浅剪从未真正执行，v4 实证）
    const R = node.r ?? {};
    const cand = {
      ...node,
      entryF: node.entryF ?? R.entryF, endF: node.endF ?? R.endF, metAt: node.metAt ?? R.metAt,
      metIdx: node.metIdx ?? R.metIdx,
    };
    const mi = cand.metIdx ?? { fb: cand.sf.length, wg: cand.sw.length };
    const depthTries = [[mi.fb, mi.wg]];
    for (const k of [1, 2, 3]) {
      const t = [Math.min(cand.sf.length, mi.fb + k), Math.min(cand.sw.length, mi.wg + k)];
      if (t[0] !== depthTries.at(-1)[0] || t[1] !== depthTries.at(-1)[1]) depthTries.push(t);
    }
    depthTries.push([cand.sf.length, cand.sw.length]);
    let best = null;
    for (const [kFb, kWg] of depthTries) {
      const trimmed = { ...cand, sf: cand.sf.slice(0, Math.max(1, kFb)), sw: cand.sw.slice(0, Math.max(1, kWg)), parked: true };
      const totalFrames = (cand.endF > 0 ? cand.endF : prefixF + segC.horizonF) + 30;
      const dr = replayEvents(trimmed.sf, trimmed.sw, totalFrames);
      if (!dr.result.won && dr.result.deathF >= 0) {
        // 修剪重放死亡只作兜底记录，继续试更深保留（浅剪死亡→深保留可能不死且过窗）
        const rec = { cand: trimmed, inline: { fatal: SAMPLES, groups: [] }, score2: -1e6, seamEntryF: -1, trimDepth: [kFb, kWg] };
        if (!best) best = rec;
        continue;
      }
      const deadlineAbsF = (cand.entryF >= 0 ? cand.entryF : 0) + segC.horizonF;
      const ins = inlineSample(dr.events, segC, deadlineAbsF, SAMPLES, Math.max(0, cand.entryF));
      let seamEntryF = -1;
      if (nextC) {
        const nr = evaluate(nextC, trimmed.sf, trimmed.sw, cand.endF + SEAM_GRACE_F + 120);
        if (seamOkNr(nr, trimmed, nextC)) seamEntryF = nr.entryF;
      }
      const rec = { cand: trimmed, events: dr.events, inline: ins, score2: cand.score - 500 * ins.fatal, seamEntryF, trimDepth: [kFb, kWg] };
      if (!best || ((rec.seamEntryF >= 0) - (best.seamEntryF >= 0)) > 0) best = rec;
      else if (best.seamEntryF >= 0 === rec.seamEntryF >= 0 && rec.score2 > best.score2) best = rec;
      if (best.seamEntryF >= 0) break; // 深度阶梯已过关（优先浅剪），停止加保留
    }
    out.push(best);
  }
  out.sort((x, y) => ((y.seamEntryF >= 0) - (x.seamEntryF >= 0)) || (y.score2 - x.score2));
  return out[0];
}

/** seam 判据（§9-3 v4）：下段 entryG 实测命中 + 双侧队列排干（防永不完成原语阻塞，S5 教训）
 *  + 入窗帧【移动中】的角色须在排干前入窗（排干后该侧 adds 接管输入必然扰动移动态；
 *  站立侧豁免——搜索自会选温和开场原语，full-rob2 锁存行走穿越 vs v3 S0a 站立保持两形态实证）
 *  + 【入窗态须存续到冻结帧】（v4 新增，S1 教训：剪掉尾部 sleep 后锁存 left，入窗瞬间
 *  |vx| 小被当站立豁免，实为走离板缘的前奏——entry 只在 f814 命中一瞬，冻结态已走落西缘。
 *  entry 是下段的稳定泊位契约，蒸发即伪过）。 */
function seamOkNr(nr, trimmed, nextC) {
  if (nr.entryF < 0 || !nr.entryS) return false;
  const drained = nr.idxEnd.fb >= trimmed.sf.length && nr.idxEnd.wg >= trimmed.sw.length;
  if (!drained) return false;
  const pre = (r) => nr.drainF[r] >= 0 && nr.entryF <= nr.drainF[r];
  const moving = (r) => Math.abs(nr.entryS[r].vx) > 25;
  for (const r of ["fb", "wg"]) if (moving(r) && !pre(r)) return false;
  if (nextC && !allS(nextC.entryG, nr.S, nr.M, nr.D)) return false;
  return true;
}

/** seam 校验（§9-3）：对【修剪后】定稿程序以 evaluate 重放，逐帧查下一段 entryG（含死亡短路）。
 *  旧版先断言修剪前存储终态 = 假阳性（修剪剪掉的在飞原语弧线可能正是入窗穿越，S0b 饥饿实证），废除。 */
function seamCheck(final, nextSegDef) {
  const nextC = segCtxOf(nextSegDef);
  const nr = evaluate(nextC, final.cand.sf, final.cand.sw, final.cand.endF + SEAM_GRACE_F + 120);
  if (!seamOkNr(nr, final.cand, nextC)) return { ok: false };
  return { ok: true, entryF: nr.entryF, grace: Math.max(0, nr.entryF - final.cand.endF) };
}

// ---------------------------------------------------------------- --verify 模式：对既有 routes JSON 复核 + ±Nf 扫描
if (hasFlag("verify")) {
  const vp = resolve(ROOT, argOf("verify"));
  const doc = JSON.parse(readFileSync(vp, "utf8"));
  const { runKernel } = kernel;
  const base = runKernel(doc.level, doc);
  console.log(`基线: ${base.won ? `WIN @f${base.winF}` : `FAIL ${base.deathF < 0 ? "超时" : "死亡@" + base.deathF}`}`);
  const MAXD = Number(argOf("max", "2"));
  const JOBS = Number(argOf("jobs", "7"));
  const { ScanPool } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "pool.mjs")).href);
  const pool = new ScanPool(JOBS);
  const t0 = Date.now();
  for (let d = 1; d <= MAXD; d++) {
    const jobs = [];
    for (const side of ["fb", "wg"])
      for (let i = 0; i < doc[side].length; i++)
        for (const dir of [-d, d]) {
          const T = { fb: doc.fb.map((e) => ({ ...e })), wg: doc.wg.map((e) => ({ ...e })) };
          T[side][i].f += dir;
          jobs.push({ side, i, f: doc[side][i].f, dir, route: T });
        }
    const rs = await Promise.all(jobs.map((j) => pool.run(doc.level, j.route).then((r) => ({ ...j, won: r.won, deathF: r.deathF })).catch(() => ({ ...j, won: false, err: true }))));
    const fatal = rs.filter((x) => !x.won);
    console.log(`±${d}f fatal: ${fatal.length}/${jobs.length}${fatal.length ? " → " + fatal.slice(0, 12).map((x) => `${x.side}#${x.i}@f${x.f}${x.dir > 0 ? "+" : ""}${x.dir}`).join(" ") : ""}`);
    if (d === MAXD) {
      pool.close();
      console.log(`扫描完成（${((Date.now() - t0) / 1000).toFixed(0)}s, ${JOBS} workers）`);
    }
  }
  process.exit(base.won ? 0 : 1);
}

// ---------------------------------------------------------------- 搜索主循环（--segs i-j）
const t0All = Date.now();
const wallBudgetS = MAXMINUTES * 60;
const report = {
  level: LEVEL, chain: CHAIN_PATH, beam: BEAM, budget: BUDGET, samples: SAMPLES,
  startedAt: new Date().toISOString(), segs: [], totals: null, robust: null, export: null,
};

// resume：载入先前各段定稿程序作为种子前缀。
// 注意：定稿程序是【累积制】（f0 起全链前缀），取最后一段的 sf/sw 即可——
// 若逐段 push 拼接会得到 O(n²) 重复巨型程序（历史块重放导致轨迹发散，S7 实证）。
let seedSf = [], seedSw = [], prefixF = 0, startIdx = segRange[0];
const resumePath = argOf("resume");
if (resumePath) {
  const prev = JSON.parse(readFileSync(isAbsolute(resumePath) ? resumePath : resolve(ROOT, resumePath), "utf8"));
  for (const s of prev.segs) {
    if (!s.final) break;
    seedSf = [...s.final.sf]; seedSw = [...s.final.sw]; prefixF = s.final.endF;
  }
  startIdx = Math.max(segRange[0], prev.segs.filter((s) => s.final).length);
  log(`resume: 载入前 ${startIdx} 段定稿（累积程序 fb ${seedSf.length} / wg ${seedSw.length} 原语，前缀 ${prefixF}f）`);
}

let okSegs = 0;
for (let si = startIdx; si <= segRange[1]; si++) {
  const segDef = chain.segments[si];
  if (!segDef) break;
  const wallLeftS = wallBudgetS - (Date.now() - t0All) / 1000;
  if (wallLeftS <= 60) { log(`整关墙钟预算（${MAXMINUTES}min）耗尽，停在段 ${segDef.id}`); break; }
  log(`== 段 ${segDef.id}（${si + 1}/${chain.segments.length}）${segDef.title} horizon=${segDef.horizonF}f`);
  const seeds = seedSf.length || seedSw.length ? [{ sf: seedSf, sw: seedSw }] : [{ sf: [], sw: [] }];
  const segRes = searchSegment(segDef, seeds, { t0: t0All, wallBudgetS, prefixF, nextDef: chain.segments[si + 1] ?? null });
  const segReport = { id: segRes.id, title: segRes.title, solved: segRes.solved, exhausted: segRes.exhausted, evals: segRes.evals, wallS: segRes.wallS, layers: segRes.layers, bestEver: segRes.bestEver ? { ...segRes.bestEver, sf: undefined, sw: undefined } : null };

  if (!segRes.solved) {
    // 失败语义工件（§6）：最高解锁路标 / 卡点断言 / 逐层曲线 / 死因 / 前沿 beam 程序（复活与词表修补的实证依据）
    segReport.failure = {
      bestUnlocked: segRes.bestEver?.unlocked ?? 0,
      note: "机器穷尽报告：见 layers 曲线与 bestEver 终态；卡点=首个未达 waypoint 组",
    };
    segReport.beam = segRes.beam.slice(0, 6).map((n) => ({
      score: +n.score.toFixed(0), met: !!n.met, entryF: n.entryF, endF: n.endF,
      S: { fb: [+n.S.fb.x.toFixed(1), +n.S.fb.y.toFixed(1)], wg: [+n.S.wg.x.toFixed(1), +n.S.wg.y.toFixed(1)] },
      sf: n.sf, sw: n.sw,
    }));
    report.segs.push(segReport);
    log(`${segDef.id} 未解——后续段中止`);
    break;
  }

  // 段定稿（top-8 inline 采样 + 修剪阶梯 + 下段 entry 实测，seam 优先定稿）+ 种子泊位
  const nextDef0 = chain.segments[si + 1] ?? null;
  const fin = await finalizeSegment(segRes, segDef, prefixF, nextDef0);
  if (!fin) {
    segReport.failure = { ...(segReport.failure ?? {}), note: "定稿池空（beam 无 met 候选）" };
    report.segs.push(segReport);
    log(`${segDef.id} 定稿池空——后续段中止`);
    break;
  }
  segReport.final = {
    sf: fin.cand.sf, sw: fin.cand.sw, score: +fin.cand.score.toFixed(0), score2: +fin.score2.toFixed(0),
    entryF: fin.cand.entryF, endF: fin.cand.endF, metAt: fin.cand.metAt,
    inlineFatal: fin.inline.fatal, inlineGroups: fin.inline.groups,
    trimDepth: fin.trimDepth ?? null, seamEntryF: fin.seamEntryF ?? null,
    prog: { fb: progNames(fin.cand.sf), wg: progNames(fin.cand.sw) },
  };
  log(`  ${segDef.id} 定稿: score'=${fin.score2.toFixed(0)} inlineFatal=${fin.inline.fatal}/${SAMPLES} end@f${fin.cand.endF} trim=${(fin.trimDepth ?? []).join("/")} seamEntry@${fin.seamEntryF ?? "-"}`);

  // seam 校验（对下一段 entry；末段无）
  const nextDef = chain.segments[si + 1];
  if (nextDef) {
    const seam = seamCheck(fin, nextDef);
    segReport.seam = seam;
    if (!seam.ok) {
      log(`  ${segDef.id}→${nextDef.id} seam 失败（定稿终态不过下段 entry，宽限 ${SEAM_GRACE_F}f 内亦未达）`);
      // 回退路径（R3）：换种子——用 beam 次优定稿重试一次
      const alt = segRes.beam.filter((n) => n.met && n !== fin.cand).slice(0, 2);
      let salvaged = null;
      for (const altCand of alt) {
        const ami = altCand.metIdx ?? { fb: altCand.sf.length, wg: altCand.sw.length };
        const trimmed = { ...altCand, sf: altCand.sf.slice(0, Math.max(1, ami.fb)), sw: altCand.sw.slice(0, Math.max(1, ami.wg)), parked: true };
        const altFin = { cand: trimmed, inline: { fatal: 0, groups: [] }, score2: altCand.score };
        const s2 = seamCheck(altFin, nextDef);
        if (s2.ok) {
          salvaged = true; segReport.final = { sf: trimmed.sf, sw: trimmed.sw, score: +altCand.score.toFixed(0), score2: +altCand.score.toFixed(0), entryF: altCand.entryF, endF: altCand.endF, metAt: altCand.metAt, inlineFatal: null, inlineGroups: [], prog: { fb: progNames(trimmed.sf), wg: progNames(trimmed.sw) }, seamRescued: true }; segReport.seam = s2; fin.cand = trimmed; fin.inline = { fatal: 0, groups: [] }; break;
        }
      }
      if (!salvaged) {
        report.segs.push(segReport);
        log(`${segDef.id} 换种子仍 seam 失败——停（R3 回退耗尽）`);
        break;
      }
      log(`  ${segDef.id} seam 经换种子恢复（entry@f${segReport.seam.entryF}）`);
    } else {
      log(`  seam → ${nextDef.id} entry@f${seam.entryF}（grace ${seam.grace}f）`);
    }
    fin.entryF = segReport.seam.entryF;
  }

  // 前缀推进：候选程序已是 f0 起的全程序，整体替换
  seedSf = [...fin.cand.sf];
  seedSw = [...fin.cand.sw];
  prefixF = fin.cand.endF;
  report.segs.push(segReport);
  okSegs++;
}

// ---------------------------------------------------------------- 导出 + 终验
let exportInfo = null;
if (okSegs >= 1) {
  const last = report.segs[report.segs.length - 1];
  const allSolved = report.segs.length === chain.segments.slice(segRange[0], segRange[1] + 1).length && report.segs.every((s) => s.solved);
  if (allSolved) {
    const sf = last.final.sf, sw = last.final.sw;
    // 重放上限 = 前缀 + 末段 horizon + 宽限（WIN 帧可落在 entry 后数百帧，prefix+90 不够——S7 实证 WIN@f1978）
    const segH = chain.segments[segRange[1]].horizonF ?? 500;
    const dr = replayEvents(sf, sw, prefixF + segH + GRACE_F + 120);
    log(`定稿重放: ${dr.result.won ? `WIN @f${dr.result.winF}` : dr.result.deathF >= 0 ? `死亡@f${dr.result.deathF}` : "未胜"}`);
    if (dr.result.won) {
      const totalFrames = dr.result.winF + 60;
      const doc = toRouteDoc(LEVEL, dr.events, totalFrames, `autosearch (beam${BEAM}, samples${SAMPLES}, ${new Date().toISOString().slice(0, 10)})`);
      mkdirSync(dirname(OUT_PATH), { recursive: true });
      writeFileSync(OUT_PATH, JSON.stringify(doc, null, 1) + "\n");
      const rk = kernel.runKernel(LEVEL, doc);
      log(`runKernel 复核: ${rk.won ? `WIN @f${rk.winF}` : "FAIL"} → ${OUT_PATH}`);
      exportInfo = { path: OUT_PATH, totalFrames, events: { fb: doc.fb.length, wg: doc.wg.length }, runKernel: rk };
      report.export = exportInfo;
    }
  }
}

// ---------------------------------------------------------------- 与绿路线对比（仅最终对比用，不进搜索）
function greenCompare() {
  try {
    const g = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
    const rk = kernel.runKernel(LEVEL, g);
    return { source: "forest_01.json(v38,人工)", winF: rk.winF ?? null, won: rk.won, events: { fb: g.fb.length, wg: g.wg.length } };
  } catch { return null; }
}

// ---------------------------------------------------------------- 鲁棒验收（ScanPool，§4.3 阶段二）
async function robustAcceptance() {
  if (!exportInfo) return null;
  const { ScanPool } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "pool.mjs")).href);
  const doc = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  const JOBS = Number(argOf("jobs", "7"));
  const pool = new ScanPool(JOBS);
  const out = { base: null, pm1: null, pm2: null };
  // 基线用进程内 runKernel（scanworker 只回 won/deathF，无 winF——"WIN @fundefined" 假象即此）
  const rkBase = kernel.runKernel(doc.level, doc);
  out.base = { won: rkBase.won, winF: rkBase.winF ?? null };
  log(`鲁棒验收基线: ${rkBase.won ? `WIN @f${rkBase.winF}` : "FAIL"}`);
  for (const d of [1, 2]) {
    const jobs = [];
    for (const side of ["fb", "wg"])
      for (let i = 0; i < doc[side].length; i++)
        for (const dir of [-d, d]) jobs.push({ side, i, f: doc[side][i].f, dir });
    const rs = await Promise.all(jobs.map((j) => {
      const T = { fb: doc.fb.map((e) => ({ ...e })), wg: doc.wg.map((e) => ({ ...e })) };
      T[j.side][j.i].f += j.dir;
      return pool.run(doc.level, { totalFrames: doc.totalFrames, fb: T.fb, wg: T.wg }).then((r) => ({ ...j, won: r.won, deathF: r.deathF })).catch(() => ({ ...j, won: false, err: true }));
    }));
    const fatal = rs.filter((x) => !x.won);
    const rec = { total: jobs.length, fatal: fatal.length, rate: +(fatal.length / jobs.length).toFixed(4), fatalList: fatal.slice(0, 40).map((x) => ({ side: x.side, i: x.i, f: x.f, dir: x.dir, deathF: x.deathF ?? null })) };
    out[`pm${d}`] = rec;
    log(`±${d}f fatal: ${fatal.length}/${jobs.length}`);
  }
  pool.close();
  return out;
}

if (exportInfo) {
  report.robust = await robustAcceptance();
  report.greenCompare = greenCompare();
} else {
  report.greenCompare = null;
}

report.totals = {
  segsSolved: okSegs, segsTotal: chain.segments.slice(segRange[0], segRange[1] + 1).length,
  evals: report.segs.reduce((a, s) => a + (s.evals ?? 0), 0),
  wallS: +((Date.now() - t0All) / 1000).toFixed(1),
  fullAuto: okSegs === chain.segments.length,
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1) + "\n");
log(`\n搜索报告 → ${REPORT_PATH}`);
log(`段 ${okSegs}/${report.totals.segsTotal} 解，evals=${report.totals.evals}，wall=${report.totals.wallS}s`);
if (report.robust) {
  const gate = report.robust.pm1.fatal === 0;
  log(`±1f 门（fatal=0）: ${gate ? "PASS" : `FAIL（${report.robust.pm1.fatal}）`}; ±2f 计数: ${report.robust.pm2.fatal}/${report.robust.pm2.total}`);
}
process.exit(0);

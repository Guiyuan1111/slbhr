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
    maxDepth: 12, capFb: 8, capWg: 5,
    vocab: {
      // fb：廊上西行过杆（x≈304 翻转 l0 → P1 下沉 90f）→ 续西 → 跳上西行登 P1 沉位 → 西行贴墙
      fb: [spec("goTo", 250, 10), spec("goTo", 230, 10), spec("goTo", 180, 12), spec("goTo", 150, 12),
        spec("jumpDrift", -1, 0, 60), spec("jumpDrift", -1, 0, 80), spec("jumpOnto", -1, 555), spec("jumpOnto", -1, 570),
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
        spec("sleep", 15)],
      wg: [spec("sleep", 30), spec("waitPx", "fb", 1080, 1214), spec("goTo", 1060, 12), spec("goTo", 1100, 12),
        spec("sleep", 15)],
    },
  },
  S5: {
    maxDepth: 14, capFb: 8, capWg: 12,
    vocab: {
      // fb：先走回 b0 上方再压站（种尾截断的 jd 会让 fb 多跳一步离箱，需回位）→ 候 wg 登 P0
      //   （b0 已压）→ 离 b0 西跳上 288 块（P0 载 wg 升）→ 块顶西行（自然推箱随行）
      fb: [spec("goTo", 970, 10), spec("goTo", 992, 10), spec("sleep", 30), spec("waitPx", "wg", 1100, 1214),
        spec("jumpDrift", -1, 0, 30), spec("jumpDrift", -1, 0, 50),
        spec("jumpOnto", -1, 290), spec("goTo", 750, 12), spec("goTo", 700, 12), spec("goTo", 650, 12), spec("sleep", 15)],
      // wg：东行靠 P0 沉位立面（go 1080 同 S4 fb 实证，1100 被立面顶住永不达）→ 立面跳登乘
      //   → 骑乘唤醒升至顶（fb 离 b0）→ 跳西上板 → 东缘步级跳上 288 块 → 西行就位
      wg: [spec("goTo", 1080, 12), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475), spec("ride", 0, 396, 412),
        spec("jumpDrift", -1, 0, 50), spec("runJump", -1, 1100),
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
    maxDepth: 8, capFb: 5, capWg: 5,
    vocab: {
      fb: [spec("goTo", 700, 12), spec("goTo", 900, 12), spec("goTo", 1056, 8), spec("goTo", 1050, 8), spec("sleep", 15)],
      wg: [spec("goTo", 700, 12), spec("goTo", 900, 12), spec("goTo", 1168, 8), spec("goTo", 1160, 8), spec("sleep", 15)],
    },
  },
};

// ---------------------------------------------------------------- evaluate：单候选全量重放（进程内确定性，§1.4）
// 语义对齐 botcore.drive（fb→wg→step，run→done→推进，死亡/WIN 短路），
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
  for (let f = 0; f < totalCapF; f++) {
    const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
    const idxSnap = { fb: idx.fb, wg: idx.wg }; // 本帧将执行的原语下标（done 推进前）
    for (const role of ["fb", "wg"]) {
      const stp = progs[role][idx[role]];
      if (!stp) { inputs[role] = NONE; continue; }
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
      if (d) idx[role]++;
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
    if (entryF < 0 && allS(segC.entryG, Sx, Mx, Dx)) entryF = f;
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
    deathF, deadWho, entryF, wpMetF, metAt, wonAt, endF, metIdx,
    S: Send, M: w.mechSnapshot(),
    D: { won: w.phase === "won", doors: { fireboy: { isUp: w.doors.fireboy.isUp }, watergirl: { isUp: w.doors.watergirl.isUp } } },
  };
}
const GRACE_F = Number(argOf("grace", "25"));

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
function inlineSample(baseEvents, segC, deadlineAbsF, R) {
  const evs = { fb: baseEvents.fb, wg: baseEvents.wg };
  const all = [];
  for (const side of ["fb", "wg"]) for (let i = 0; i < evs[side].length; i++) all.push({ side, i });
  if (!all.length) return { fatal: R, groups: [] };
  let fatal = 0;
  const groups = [];
  for (let g = 0; g < R; g++) {
    const pick = all[Math.floor(Math.random() * all.length)];
    const dir = Math.random() < 0.5 ? -1 : 1;
    const T = { fb: evs.fb.map((e) => ({ ...e })), wg: evs.wg.map((e) => ({ ...e })) };
    T[pick.side][pick.i].f += dir;
    const ok = replayEventRoute(T, segC, deadlineAbsF);
    if (!ok) { fatal++; groups.push({ side: pick.side, i: pick.i, f: evs[pick.side][pick.i].f, dir }); }
  }
  return { fatal, groups };
}
/** 扰动事件表回放：死亡或 deadlineAbsF 内 target 未达 → false */
function replayEventRoute(T, segC, deadlineAbsF) {
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
  return met;
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
    for (const node of beam) {
      const dFb = node.sf.length, dWg = node.sw.length;
      const role = dFb > dWg ? "wg" : dWg > dFb ? "fb" : (depth % 2 ? "fb" : "wg");
      if ((role === "fb" && dFb - seedFb >= capFb) || (role === "wg" && dWg - seedWg >= capWg)) continue;
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
    beam = cands.slice(0, BEAM); // 仅前沿 beam（E3 定版：时长惩罚使父代恒优于子代，同池会耗尽前沿）
    const b = beam[0];
    if (!bestEver || b.score > bestEver.score) bestEver = b;
    layers.push({
      depth, evals, best: +b.score.toFixed(0), unlocked: b.unlocked, met: b.met,
      entryF: b.r.entryF, endF: b.r.endF,
      fb: [+b.r.S.fb.x.toFixed(0), +b.r.S.fb.y.toFixed(0)], wg: [+b.r.S.wg.x.toFixed(0), +b.r.S.wg.y.toFixed(0)],
      path: progNames(b.sf).slice(0, 160) + " | " + progNames(b.sw).slice(0, 160),
    });
    log(`  ${segDef.id} d${depth}: evals=${evals} best=${b.score.toFixed(0)} wp=${b.unlocked}/${segC.wpG.length} met=${b.met} entry@${b.r.entryF} fb=[${layers.at(-1).fb}] wg=[${layers.at(-1).wg}]`);
    if (b.met) { solved = b; break; }
    if (evals > BUDGET) { log(`  ${segDef.id} evals 预算耗尽（${BUDGET}）`); exhausted = true; break; }
    if ((Date.now() - opts.t0) / 1000 > opts.wallBudgetS) { log(`  ${segDef.id} 墙钟预算耗尽`); exhausted = true; break; }
  }
  return {
    id: segDef.id, title: segDef.title, horizonF: segC.horizonF, maxDepth,
    solved: !!solved, exhausted, evals, wallS: +((Date.now() - t0) / 1000).toFixed(1), layers,
    bestEver: bestEver ? { score: +bestEver.score.toFixed(0), unlocked: bestEver.unlocked, met: bestEver.met, entryF: bestEver.r.entryF, endF: bestEver.r.endF, fb: [+bestEver.r.S.fb.x.toFixed(0), +bestEver.r.S.fb.y.toFixed(0)], wg: [+bestEver.r.S.wg.x.toFixed(0), +bestEver.r.S.wg.y.toFixed(0)], sf: bestEver.sf, sw: bestEver.sw } : null,
    solvedCand: solved ? { score: +solved.score.toFixed(0), unlocked: solved.unlocked, entryF: solved.r.entryF, endF: solved.r.endF, metAt: solved.r.metAt, sf: solved.sf, sw: solved.sw, S: solved.r.S, M: solved.r.M, D: solved.r.D } : null,
    beam: beam.filter((n) => n.r).slice(0, 6).map((n) => ({ score: +n.score.toFixed(0), met: !!n.met, unlocked: n.unlocked ?? n.r.unlocked, entryF: n.r.entryF, endF: n.r.endF, metAt: n.r.metAt, metIdx: n.r.metIdx, sf: n.sf, sw: n.sw, S: n.r.S, M: n.r.M, D: n.r.D })),
  };
}

/** 段定稿：top-3（beam 前 3 达标者）各 drive 重放收事件表 + inline 采样，score′ 最高者为段定稿（§4.3 阶段一） */
function finalizeSegment(segRes, segDef, prefixF) {
  const segC = segCtxOf(segDef);
  const pool3 = segRes.beam.filter((n) => n.met).slice(0, 3);
  const out = [];
  for (const cand of pool3) {
    const totalFrames = (cand.endF > 0 ? cand.endF : prefixF + segC.horizonF) + 30;
    const dr = replayEvents(cand.sf, cand.sw, totalFrames);
    if (!dr.result.won && dr.result.deathF >= 0) { out.push({ cand, inline: { fatal: SAMPLES, groups: [] }, score2: -1e6 }); continue; }
    const deadlineAbsF = (cand.entryF >= 0 ? cand.entryF : 0) + segC.horizonF;
    const ins = inlineSample(dr.events, segC, deadlineAbsF, SAMPLES);
    out.push({ cand, events: dr.events, inline: ins, score2: cand.score - 500 * ins.fatal });
  }
  out.sort((x, y) => y.score2 - x.score2);
  const win = out[0];
  // 种子队尾截断：metAt 帧尚未启动的原语对达标无贡献，其悬空条件谓词（waitPx 等）
  // 会在下一段重放中永久阻塞队列（S5 实证）。保留 metAt 帧的活动原语让其自然收尾。
  if (win?.cand?.metIdx) {
    win.cand = {
      ...win.cand,
      sf: win.cand.sf.slice(0, Math.min(win.cand.sf.length, win.cand.metIdx.fb + 1)),
      sw: win.cand.sw.slice(0, Math.min(win.cand.sw.length, win.cand.metIdx.wg + 1)),
    };
  }
  return win;
}

/** seam 校验（§9-3）：段定稿终态直接断言下一段 entry；失败宽限 SEAM_GRACE_F 帧重查（事件表确定性重放） */
function seamCheck(final, nextSegDef) {
  const nextC = segCtxOf(nextSegDef);
  const probe = (Sx, Mx, Dx) => allS(nextC.entryG, Sx, Mx, Dx);
  if (probe(final.cand.S, final.cand.M, final.cand.D)) return { ok: true, entryF: final.cand.endF, grace: 0 };
  const totalFrames = final.cand.endF + SEAM_GRACE_F + 2;
  const dr = replayEvents(final.cand.sf, final.cand.sw, totalFrames);
  const ins = expandFlat(dr.events.fb, dr.events.wg, totalFrames);
  const w2 = makeWorld(LEVEL);
  for (let f = 0; f < totalFrames; f++) {
    w2.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w2.snapshotPlayer("fireboy"), b = w2.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) break;
    const Sx = {
      fb: { x: a.x, y: a.y, vx: a.vx, vy: a.vy, atDoor: a.atDoor, grounded: w2.players.fireboy.feetContacts.length > 0, dead: a.dead || a.dying },
      wg: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, atDoor: b.atDoor, grounded: w2.players.watergirl.feetContacts.length > 0, dead: b.dead || b.dying },
    };
    const Mx = w2.mechSnapshot();
    const Dx = { won: w2.phase === "won", doors: w2.doors };
    if (f >= final.cand.endF && probe(Sx, Mx, Dx)) return { ok: true, entryF: f, grace: f - final.cand.endF };
  }
  return { ok: false };
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

// resume：载入先前各段定稿程序作为种子前缀
let seedSf = [], seedSw = [], prefixF = 0, startIdx = segRange[0];
const resumePath = argOf("resume");
if (resumePath) {
  const prev = JSON.parse(readFileSync(isAbsolute(resumePath) ? resumePath : resolve(ROOT, resumePath), "utf8"));
  for (const s of prev.segs) {
    if (!s.final) break;
    seedSf.push(...s.final.sf); seedSw.push(...s.final.sw); prefixF = s.final.endF;
  }
  startIdx = Math.max(segRange[0], prev.segs.filter((s) => s.final).length);
  log(`resume: 载入前 ${startIdx} 段定稿（前缀 ${prefixF}f）`);
}

let okSegs = 0;
for (let si = startIdx; si <= segRange[1]; si++) {
  const segDef = chain.segments[si];
  if (!segDef) break;
  const wallLeftS = wallBudgetS - (Date.now() - t0All) / 1000;
  if (wallLeftS <= 60) { log(`整关墙钟预算（${MAXMINUTES}min）耗尽，停在段 ${segDef.id}`); break; }
  log(`== 段 ${segDef.id}（${si + 1}/${chain.segments.length}）${segDef.title} horizon=${segDef.horizonF}f`);
  const seeds = seedSf.length || seedSw.length ? [{ sf: seedSf, sw: seedSw }] : [{ sf: [], sw: [] }];
  const segRes = searchSegment(segDef, seeds, { t0: t0All, wallBudgetS, prefixF });
  const segReport = { id: segRes.id, title: segRes.title, solved: segRes.solved, exhausted: segRes.exhausted, evals: segRes.evals, wallS: segRes.wallS, layers: segRes.layers, bestEver: segRes.bestEver ? { ...segRes.bestEver, sf: undefined, sw: undefined } : null };

  if (!segRes.solved) {
    // 失败语义工件（§6）：最高解锁路标 / 卡点断言 / 逐层曲线 / 死因
    segReport.failure = {
      bestUnlocked: segRes.bestEver?.unlocked ?? 0,
      note: "机器穷尽报告：见 layers 曲线与 bestEver 终态；卡点=首个未达 waypoint 组",
    };
    report.segs.push(segReport);
    log(`${segDef.id} 未解——后续段中止`);
    break;
  }

  // 段定稿（top-3 inline 采样，score′ 定稿）
  const fin = await finalizeSegment(segRes, segDef, prefixF);
  segReport.final = {
    sf: fin.cand.sf, sw: fin.cand.sw, score: +fin.cand.score.toFixed(0), score2: +fin.score2.toFixed(0),
    entryF: fin.cand.entryF, endF: fin.cand.endF, metAt: fin.cand.metAt,
    inlineFatal: fin.inline.fatal, inlineGroups: fin.inline.groups,
    prog: { fb: progNames(fin.cand.sf), wg: progNames(fin.cand.sw) },
  };
  log(`  ${segDef.id} 定稿: score'=${fin.score2.toFixed(0)} inlineFatal=${fin.inline.fatal}/${SAMPLES} end@f${fin.cand.endF}`);

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
        const altFin = { cand: altCand, inline: { fatal: 0, groups: [] }, score2: altCand.score };
        const s2 = seamCheck(altFin, nextDef);
        if (s2.ok) {
          const trimmed = { ...altCand, sf: altCand.sf.slice(0, Math.min(altCand.sf.length, (altCand.metIdx?.fb ?? altCand.sf.length - 1) + 1)), sw: altCand.sw.slice(0, Math.min(altCand.sw.length, (altCand.metIdx?.wg ?? altCand.sw.length - 1) + 1)) };
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
    const dr = replayEvents(sf, sw, prefixF + 90);
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
  const base = await pool.run(doc.level, { totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg });
  out.base = { won: base.won, winF: base.winF ?? null };
  log(`鲁棒验收基线: ${base.won ? `WIN @f${base.winF}` : "FAIL"}`);
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

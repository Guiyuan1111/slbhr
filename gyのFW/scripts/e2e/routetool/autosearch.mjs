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
  /** 定向持键到位置线（墙角归一化件）：按 dir 前进直到跨线即完成——后续原语接管时
   *  物理状态由墙/线锚定（冲墙滑行 v→0、后撤步离面），事件表 ±1f 只影响到达帧不影响终态。 */
  hold: (d, xLine) => S.hold(ds(d), (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine)),
  jumpDrift: (d, ...a) => S.jumpDrift(ds(d), ...a),
  /** 限速行进到线 + 过线主动反刹（精确定点件，S3 b1 板实证）：到线时速度≤vMax，
   *  过线即反刹 3 帧（~24.5px/s²）停定——slick 面松键滑阻≈0，无反刹会 coast 数百 px
   *  （dbg29 实证 walkTo(350,80) ±1f 过线速超限 → done 不燃 → coast 850px 出台缘）。
   *  goTo 防过冲刹车在 slick 面存在刹车/加速极限环（200 帧爬不进 32px 窗），此件无环。 */
  walkTo: (d, xLine, vMax = 70) => {
    const D = ds(d), O = d > 0 ? "left" : "right";
    return {
      name: `walk${d}${xLine}`,
      run: (c) => {
        const past = d > 0 ? c.me.x >= xLine : c.me.x <= xLine;
        if (!past) return Math.abs(c.me.vx) > vMax ? NONE : { ...NONE, [D]: true };
        return Math.abs(c.me.vx) > 20 ? { ...NONE, [O]: true } : NONE;
      },
      done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) && Math.abs(c.me.vx) <= 20 && c.me.grounded,
    };
  },
  jumpOnto: (d, ...a) => S.jumpOnto(ds(d), ...a),
  /** runJump 直包 + f0 护栏 + up 保持 holdF 帧 + done 语义修复。
   *  f0-护栏：character.currentRunForce 初始 undefined，关卡首帧即压方向会算出 NaN 力永久毒化
   *  刚体（vx 冻结）——只在 ctx.f≤1 时返回 NONE 让 else 分支完成初始化，首个方向事件落在 f2
   *  （±1f→f1 仍安全）；链中段原语（ctx.f>1 起跳）不受护栏，按压帧零漂移。
   *  up-保持：S.runJump 起跳次帧即松 up（press/release 对 Δ=1），事件表 ±1f 会把两事件
   *  坍缩到同一帧 → up 有效宽度 0 → 跳跃消失（dbg19 fb[1]/fb[2]、墙跳 fb[31]/fb[32] 实证）。
   *  holdF=起跳后 up 总时长（帧），spec 尾参可调（缺省 6）：可变跳高的"跳斩"随释放帧提前而砍
   *  弧线——带 hop/mount 用 25f（绿迹同款：弧长 259px 落 1039 留 mount 跑道；6f 砍弧落 ~1060
   *  贴脸即掠死）；短跳 6f 下 ±1f 只改 1/6 时长（~1-2px）。
   *  done 修复（dbg20 实证）：S.runJump.done 的 air 锁存不区分起跳前后——出生下落/上一跳
   *  弧线的离地帧会把 air 预置 true，本原语在自己的起跳帧（pre 态仍 grounded）即完成，队列
   *  在空中换手，下个原语立即按己方线压反向（弧线污染坠带）。改为只在【本原语起跳后】经历
   *  离地→再落地才完成；起跳前的任何离地不计数。 */
  runJump: (d, ...a) => {
    const holdF = a.length > 1 ? a[a.length - 1] : 6;
    const stp = S.runJump(ds(d), a[0]);
    const orig = stp.run.bind(stp);
    let jumpedAt = -1, airAfter = false;
    stp.run = (ctx) => {
      if (ctx.f <= 1) return NONE;
      const inp = orig(ctx);
      if (inp.up) jumpedAt = ctx.f;
      else if (jumpedAt >= 0 && ctx.f <= jumpedAt + holdF - 1) { inp.up = true; }
      if (jumpedAt >= 0 && !ctx.me.grounded) airAfter = true;
      return inp;
    };
    stp.done = (c) => jumpedAt >= 0 && airAfter && c.me.grounded;
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
    // recipe v15（dbg22 绿迹逐帧法证 2026-10-16，全连续零停顿复刻绿按压状态）：
    //   绿 fb 帧事实：f175 带跳（x~780，Δ25）→ f230 落 [1038.7,v0]（弧 259px）→ 地面重建 +24.5/f
    //   → f240 mount 跳 [1060.9,v229]（跑动起跳，非贴墙）→ 空中 v274 饱和零衰减，贴脸穿越在
    //   bottom~831（脸带 [832,) 上沿 1px 掠过，绿 222/222 实证此刀刃 ±1f 稳）→ f271 东墙钳制
    //   [1200.4] → f275 落顶 → 走西至 1171.6（v-174）f332 西跳（Δ20）→ f370 落 704 台
    //   [1001,668.6] 正中目标盒。任何停顿（goTo 振荡/后撤步）都破坏按压 (x,v) 相位 → 掠面砍升限。
    //   rj 尾参 = holdF（25/20 复刻绿 Δ）。wg 加 sleep(60) 错峰：否则与 fb 在带跳落点 ~1039
    //   （双达 f230）与塔顶 1200（双达 f260-275）两处同帧碰撞；绿 wg 表内建 f185-334 空窗同理。
    recipe: {
      fb: [spec("runJump", 1, 780, 25), spec("runJump", 1, 1052, 25), spec("runJump", -1, 1172, 20), spec("hold", -1, 1040), spec("sleep", 15)],
      wg: [spec("sleep", 60), spec("runJump", 1, 490), spec("runJump", 1, 1104, 26), spec("goTo", 1200, 12), spec("sleep", 15)],
    },
    vocab: {
      // fb v15：绿复刻链 [rj(780,25) → rj(1052,25) → rj(-1,1172,20) → sleep] 为骨架，
      //   邻域变体（线 ±10-20 / holdF 20-25）供搜索修复；goTo/hold 备而不用（停顿破坏按压相位）。
      fb: [spec("runJump", 1, 780, 25), spec("runJump", 1, 770, 25), spec("runJump", 1, 790, 25), spec("runJump", 1, 1052, 25),
        spec("runJump", 1, 1049, 25), spec("runJump", 1, 1069, 25), spec("runJump", -1, 1172, 20), spec("runJump", -1, 1162, 20),
        spec("runJump", -1, 1182, 20), spec("runJump", -1, 1172, 24), spec("hold", -1, 1000), spec("hold", -1, 1020), spec("sleep", 15), spec("sleep", 30)],
      // wg v15：spawn 错峰 sleep(60) + 既有干净链（0 fatal 实证）+ 邻域变体
      wg: [spec("sleep", 60), spec("sleep", 45), spec("sleep", 75), spec("runJump", 1, 490), spec("runJump", 1, 1104, 26),
        spec("runJump", 1, 1102, 26), spec("runJump", 1, 1106, 26), spec("goTo", 1200, 12), spec("goTo", 1190, 12), spec("sleep", 15)],
    },
  },
  S0b: {
    maxDepth: 12, capFb: 8, capWg: 8,
    // 锚定链 v2（dbg24 离线法证 2026-10-16）：双角色同构西行链。台面 ~950 起跳越双杀带
    //   [768,928]（fb 落 ~710 / wg 落 ~689，起跳点 ±5px 不触带西缘 928）→ hold(-1,540)
    //   连续西行撞 672 檐东面（x608，高出台面 32px）自动攀爬弹弧一次跨两阶（檐 672→廊 640，
    //   fb f444-500 / wg f549-570 实证，途中 x≤540 谓词在弧内完成）→ edgeDrop 收弧落地
    //   → 停靠 hold 分档（fb 470→滑停 447 / wg 520→滑停 519，间隔 72px 防重叠）。
    //   勿停杆区 296-312（防误翻 l0）。v1 之败（full-exha）：goTo 离散步进在 slick 台面
    //   落地残速下滑出目标盆 + wg hold(+1) 反向设计错误。
    recipe: {
      fb: [spec("runJump", -1, 950, 20), spec("hold", -1, 540), spec("edgeDrop", -1, 20), spec("hold", -1, 470), spec("sleep", 15)],
      // wg v4（dbg25 穷举 0/36 × 链等价拼接法证）：S0a 定稿修剪会剪掉 wg 尾部落地稳 sleep
      //   （full3 实证 trim=5/3 → S0b 自 clamp 未落稳态起步 → 终态漂移 [559,617] seam 败），
      //   S0b 头部 settle sleep(24) 吸收任意剪深 → 落稳态（驻点吸引子）与绿迹同一起跑线。
      //   绿迹塔顶出口 = 纯左走 12f (v-132)@1185 起跳 up 保持 24f 左键全程压 → 落台
      //   [1002,668.6] 续左 4f (v-233)@975 起跳 Δ26 越双杀带 → 落 [736] 续左撞檐东面
      //   自动攀爬上廊。rj 位置锚定等价复刻（起跳态由落稳 v0 确定性走步重建）。
      //   v2 之败：jd 自 clamp 悬空/落稳态直接起跳，launch 事件 ±1f 全灭（dbg25 v2 扫描 6 fails）。
      wg: [spec("sleep", 24), spec("runJump", -1, 1185, 24), spec("runJump", -1, 975, 26), spec("hold", -1, 540), spec("edgeDrop", -1, 20), spec("hold", -1, 520), spec("sleep", 15)],
    },
    vocab: {
      fb: [spec("runJump", -1, 950, 20), spec("runJump", -1, 975, 20), spec("runJump", -1, 925, 20),
        spec("hold", -1, 540), spec("hold", -1, 560), spec("edgeDrop", -1, 20),
        spec("hold", -1, 470), spec("hold", -1, 490), spec("sleep", 15)],
      wg: [spec("sleep", 24), spec("sleep", 18), spec("sleep", 30),
        spec("runJump", -1, 1185, 24), spec("runJump", -1, 1175, 24), spec("runJump", -1, 1195, 24),
        spec("runJump", -1, 975, 26), spec("runJump", -1, 965, 26), spec("runJump", -1, 985, 26),
        spec("hold", -1, 540), spec("hold", -1, 560), spec("edgeDrop", -1, 20),
        spec("hold", -1, 520), spec("hold", -1, 490), spec("sleep", 15)],
    },
  },
  S1: {
    maxDepth: 14, capFb: 8, capWg: 8, horizonF: 450,
    // 登板宏 v3（dbg16 扰动归因，2026-10-16）：s1r6 inline 10/20 全归因于两个动量敏感点
    // ——(a) 障碍 [230,312] 的自动攀爬（步行速度恰好够，wg 卡 310/fb 卡 233-262）、
    // (b) jo 漂移阈值 546 的越顶边界（apex 余量 ~27px，±1f 落回地面即搁浅）。
    // 双跳配方：jd35 弹道越障碍（落点宽盆 [150,240]）+ jd30 空降板顶西段（feet apex 549
    // 越板顶 576，落点 ~[40,80] ∈ 目标 px[24,72]），go60 收容两盆地；waitPlat 先行吸收
    // wg 过杆 ±1f（状态锚定）。horizon 450：metAt ~f900（segF ~380）。
    recipe: {
      fb: [spec("waitPlat", 1, 586, 600), spec("goTo", 330, 10), spec("jumpDrift", -1, 0, 35), spec("goTo", 180, 10), spec("jumpDrift", -1, 0, 28), spec("runJump", -1, 78), spec("sleep", 30)],
      wg: [spec("goTo", 280, 10), spec("jumpDrift", -1, 0, 35), spec("goTo", 200, 12), spec("sleep", 15)],
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
    // wg 登板 v2（dbg26 法证 2026-10-16）：沉底 P1（P1y 恒 592.3 不回升，ride 无效）东缘 x160
    //   高出廊面 48px 成坎——S1 出发位 [190.7,604.5] 西行被坎卡死（v1 vocab goTo120/100 全死锁，
    //   full4 S2 未解根因）。原地 jo(-1,570)：垂直起跳 + 高空(y<570)左漂 ~31px 过坎落台东缘
    //   [159.6,542.7]，板上 goTo(60) 西行入窗 [24,80]（板上无障碍，fb 已东跳不挡）。
    //   jo(-1,555) 漂移窗过短不过坎（dbg26 v4 实证）。
    //   v3 补 waitPx 跨角色同步（dbg-s2b 轨迹法证）：wg 若立即登板则 ~f800 永久离开廊窗
    //   [140,280]×[598,618]，而 fb 要 ~f910 才滑入 shaft 窗 → 联合 entry 永不触发（entry@-1，
    //   full5 recipe 宏假死根因）。waitPx("fb",24,72) 状态锚定等 fb 入窗再跳，entry ~f890 即燃。
    //   v4（dbg27 穷举 0/22）：jo 位置敏感漂移 ±1f 三处脆（漂移窗随弧相位）+ goTo 防过冲
    //   刹车在 slick 台面进振荡爬行（±1f 落点漂 17px 即 200 帧爬不进窗）→ 改 jd(-1,0,24)
    //   立跳全漂 24f（落点 [47-81] 直插窗，lip 提前 27px 越过）+ hold(-1,60) 无条件西行
    //   过线即停、slick 滑行 ~80px 由竖井西墙 x~32 接住（墙锚停靠，窗锚定免疫落点方差）。
    recipe: {
      fb: [spec("jumpDrift", 1, 0, 90), spec("goTo", 220, 10), spec("sleep", 15)],
      wg: [spec("waitPx", "fb", 24, 72), spec("sleep", 60), spec("jumpDrift", -1, 0, 24), spec("hold", -1, 60), spec("sleep", 15)],
    },
    vocab: {
      // fb：P1 西缘原地跳东上 480 台（升 ~96px，绿迹同款无助跑跳）
      fb: [spec("jumpDrift", 1, 0, 90), spec("jumpDrift", 1, 0, 70), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475),
        spec("runJump", 1, 60), spec("runJump", 1, 100), spec("goTo", 200, 12), spec("goTo", 300, 12), spec("sleep", 15)],
      wg: [spec("waitPx", "fb", 24, 72), spec("sleep", 45), spec("sleep", 60), spec("sleep", 75),
        spec("jumpDrift", -1, 0, 20), spec("jumpDrift", -1, 0, 24), spec("jumpDrift", -1, 0, 28),
        spec("hold", -1, 60), spec("hold", -1, 80), spec("sleep", 15)],
    },
  },
  S3: {
    maxDepth: 12, capFb: 6, capWg: 8,
    // wg 配方 v3（dbg29 法证 2026-10-16）：jd 双弧与 jo 均为檐口 marginal 弹道——480 台西缘
    //   x128 过缘净空仅 ~5px，漂移起始 ±1f 经 auto-climb pop 放大成 ±20px 落点彩票
    //   （35/41/136 败全源于此）。v3 破局：runJump(1,0,18) 固定冲量单跳（up 保持不增跳高，
    //   三档 holdF 终态全同）+ walkTo(1,341,999) 反馈式走停（横穿速度剖面与历史扰动解耦，
    //   主动刹车 |vx|≤20 → 台面摩擦停驻）。穷举 68/68 fails=0（line 338 亦 0/68）。
    //   教训：walkTo vMax 限速脉冲步进本身是脆弱性发生器（80 脉冲事件 136 败）——
    //   vMax 拉满 999 单程直压才是正解。fb：台东行 → 东缘 640 落 512 廊 → 东行 P0 候乘位。
    recipe: {
      // fb v2（full12/13 法证 2026-10-16）：goTo(1060) 在 slick 廊面进刹车振荡极限环——
      //   振荡脉冲 ±1f 对 S3 目标不可见（环绕 1060 反复过窗）但 S4 里推迟 goTo(1060) 完成
      //   → 登乘阶梯整体晚 ~60f → S4 deadline 不 met（fb[73] left-down@1191 -1 fatal）。
      //   改 walkTo(1,1070,999)：过线即反刹，滑行被 P0 沉位西立面 x~1076 墙锚接住（pinned
      //   vx=0），停位相位免疫。S4 fb 头 goTo(1080) 随之永不可达，换 sleep(30)（S4 配方）。
      fb: [spec("goTo", 600, 12), spec("walkTo", 1, 1070, 999), spec("sleep", 15)],
      // sleep(20) 吸收头：finalizer 会砍种子尾段 settle（full8 实证 S2 trim 17/18 砍掉
      //   hold(-1,60) 后的 sleep(15) → rj 从滑行态提前 15f 发射 → 弧线变质落井底 [364,605]）
      wg: [spec("sleep", 20), spec("runJump", 1, 0, 18), spec("walkTo", 1, 341, 999), spec("sleep", 15)],
    },
    vocab: {
      // fb：480 台东行 → 东缘落 512 廊 → 东行候乘（walkTo 过线反刹 + P0 立面墙锚收滑）
      fb: [spec("goTo", 500, 12), spec("goTo", 650, 12), spec("goTo", 800, 12),
        spec("walkTo", 1, 1070, 999), spec("walkTo", 1, 1064, 999), spec("walkTo", 1, 1076, 999),
        spec("goTo", 1060, 12), spec("goTo", 1090, 12), spec("sleep", 15)],
      // wg：P1 西缘跳东上 480 台 → 东行压 b1（P0 下行）
      wg: [spec("runJump", 1, 0, 18), spec("runJump", 1, 0, 15), spec("runJump", 1, 0, 21),
        spec("walkTo", 1, 338, 999), spec("walkTo", 1, 341, 999), spec("walkTo", 1, 344, 999),
        spec("jumpDrift", 1, 0, 90), spec("sleep", 15)],
    },
  },
  S4: {
    maxDepth: 14, capFb: 12, capWg: 5,
    // r8a 宏（dbg29 离线实证 2026-10-19，种子=full14b S3 终稿：met@1379，本段跨度 ±1f 穷举 86/86 fails=0）：
    //   四跳阶梯末端两级 walkTo 校位锚——append-only beam 在 met 后无法往 jd40/jd25 之间插件
    //   （met 家系 ±1f 穷举恒 fatal：fb[74]−1→板东停偏 1025 压不到 b0；fb[77]+1→跌穿落 512 廊
    //   fb[777,477]，板面回拉均不可救，r1 定稿梯逐档打点实证），故整组宏 d1 注入一次：
    //   jd40 落 384 台后 walkTo(-1,1000) 归一化 jd25 起跳位（±1f 相位差被吸收，跌穿根除）；
    //   jd25 落板后 walkTo(-1,970) 过线反刹停驻 b0 足迹 [928,992] 压板（停偏根除）。
    //   锚件必须 walkTo 不能 goTo：goTo(970,10) 在 slick 板刹车振荡不排干（r1 not-drained
    //   idx=28/29 实证）；walkTo 主动反刹 |vx|≤20 收敛（S3 板面 68/68 同款正解）。
    //   wg：waitPx(fb,1070,1214) 即燃（fb S3 墙锚 1078 开局在窗）→ 东行 1060 离 b1 放 P0
    //   载 fb 升 + 自泊 S5 entry 窗 [1030,1120]。
    recipe: {
      fb: [spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475), spec("ride", 0, 396, 412),
        spec("jumpDrift", -1, 0, 40), spec("walkTo", -1, 1000, 999), spec("jumpDrift", -1, 0, 25), spec("walkTo", -1, 970, 999)],
      wg: [spec("waitPx", "fb", 1070, 1214), spec("walkTo", 1, 1020, 999), spec("sleep", 15)],
    },
    vocab: {
      // 实证（probe4，2026-10-15）：fb 廊上东行靠 P0 沉位西立面（x~1076，顶 480 高廊面 32px 为台）；
      //   板下台阶 y[384,416] 把净空压到 29px → 登乘只能立面垂直跳（jo 顶头截断+下落东漂上 P0）；
      //   wg 松 b1 后 P0 载 fb 升顶须 fb 骑乘唤醒（ride）；顶 384 比板 352 低 32px，跳西落板压 b0。
      fb: [spec("sleep", 30), spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475), spec("ride", 0, 396, 412),
        spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 25), spec("goTo", 970, 10), spec("goTo", 992, 10),
        spec("sleep", 60)],
      // wg v2（full16 法证 2026-10-16）：fb 墙锚停 1076 后 waitPx(fb,1080,1214) 永不燃
      //   （idx 卡 24/25 not-drained，seam 全败根因）→ 窗改 [1070,1214]；goTo(1100) 亦 slick
      //   振荡不收敛 → walkTo(1,1060,999) 单程直压反刹（S5 entry 窗 [1030,1120] 容停点摊开）
      wg: [spec("sleep", 30), spec("waitPx", "fb", 1070, 1214), spec("walkTo", 1, 1060, 999),
        spec("sleep", 15)],
    },
  },
  S5: {
    maxDepth: 20, capFb: 8, capWg: 16, horizonF: 800, // r8b: 配方全程 entry+~690f（P0 降程 ~90f+乘升 ~175f+三段跳西），600 会先冻（断言窗不变）
    // r8b 推翻 r8a（绿路线回放 explore-trace.json + board.mjs v6-v15 逐帧法证 2026-10-19）：
    //   P0 真实行程 platY 400(起)↔496(沉)（沉顶=480 即档卷"顶480"✓；r8a 的 440 是 wg 头部
    //   卡在板底下方把下降【顶停】的假沉位——wg 泊位必须 ≤1077 让降程走满）；
    //   沉顶 480 与廊面只差 32px = 台阶，wg 从 ~1057 净位 jd(1,0,14) 小跳直上（v10 onboard@1636）；
    //   "钉死区"= 身体探入 1088 立面柱 [1075,1087]（输入全废，须在下降角抵头前西撤）；
    //   b0 按钮本体悬空 [960,1024]×[333,352] 截断满跳（v6 半跳根因）；跳跃冲量随足底法线
    //   倾斜衰减（character.ts:225 sqrt√n.y 分支）。fb 压 b0 200f 保降程 → 西走 jd22 直接上
    //   288 台（无需二次乘 P0）；wg 乘升至 ~350 跳西落板再 walkTo(820) 锚窗。
    //   v15 离线终态 fb[691,253]G wg[804,253]G 双双命中 S5 窗。
    recipe: {
      // fb：原地压 b0 保 P0 降程走满（wg 台阶登乘）→ 单程连续 walkTo(-1,700)（v18：板面 317→台面
      //   253 之间是斜坡非立面，靠行进动量爬坡；中途 walkTo 停在坡上则静止重启抓不住地、滑回坡底
      //   死循环——r5b/c exFatal 根因；jd22 坡基起跳同为刀锋 ±1f 即弹）
      fb: [spec("sleep", 200), spec("walkTo", -1, 700, 999)],
      // wg：西撤出钉死带（walkTo 单程，goTo 修正版 slick 振荡卡队列=r5d exFatal 根因）→ waitPlat
      //   等沉稳 496（状态门控，解耦 fb 离钮时序 ±1f）→ jd20 台阶小跳（漂移加长防登乘落点缘差）
      //   → 东行走深防滑坠 → ride 振荡乘升（无输入乘升 175f 会 slick 打滑坠板=r5a exFatal 根因）
      //   → 跳西落坡 → 沉降 20f 防弹跳卡死 → goTo 闭环锚（v24：坡西端 ~710 即断崖落底层 477，
      //     walkTo done 后锁存 left 滑行 10-15px 是常态，落地偏西即滑坠断崖 [-1f 扰动终态 709,477
      //     实证]；goTo done 即驻留零输入）。注意：idx47 -1f 刀锋未解（v20-v24 五变体同败，乘升
      //     振荡相位与缝差耦合），此为离线最优种子，base 双窗 fb[689]/wg[809,253] 稳。
      wg: [spec("walkTo", -1, 1070, 999), spec("waitPlat", 0, 494, 498), spec("jumpDrift", 1, 0, 20), spec("walkTo", 1, 1160, 999),
        spec("ride", 0, 396, 412), spec("jumpDrift", -1, 0, 40), spec("sleep", 20), spec("goTo", 790, 25)],
    },
    vocab: {
      // fb：waitPx 燃窗变体（1080 跨缘燃/1110-1140 落板后燃）+ 老登块件
      fb: [spec("goTo", 970, 10), spec("goTo", 992, 10), spec("sleep", 30), spec("waitPx", "wg", 1080, 1214),
        spec("waitPx", "wg", 1120, 1216), spec("waitPx", "wg", 1140, 1216),
        spec("jumpDrift", -1, 0, 30), spec("jumpDrift", -1, 0, 50),
        spec("jumpOnto", -1, 290), spec("goTo", 740, 12), spec("goTo", 750, 12), spec("goTo", 700, 12), spec("goTo", 650, 12), spec("sleep", 15)],
      // wg：等 P0 泊沉（435-445）→ 泊位微调（净空窗内选起跳点）→ 立面跳登乘 → 骑乘升至顶
      //   → 东端就位 → 跳西上板 → 上 288 块 → 西行
      wg: [spec("waitPlat", 0, 430, 448), spec("goTo", 1060, 12), spec("walkTo", 1, 1065, 999),
        spec("walkTo", 1, 1075, 999), spec("walkTo", 1, 1085, 999),
        spec("jumpOnto", 1, 455), spec("jumpOnto", 1, 475), spec("ride", 0, 396, 412),
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

// ---------------------------------------------------------------- ice_02 段词表（2026-10-28，oracle 实证 + 内核探针标定）
// 地形口径（geom.mjs + oracle sweep3/sweep4 + 内核液体/机关模拟）：
//   底层 896；雪丘三层 800/768（row-25/24 台）；row-22 台 704 x[1056,1248]；row-20 台 640 x[832,992]；
//   西侧楼梯 D(25,21)+/(24,21) 下东台 736 x[640,736]；泳池（水,5）736 面 x[256,640]（wg 漂浮 714.9，
//   面即 grounded 可游可跳）；西台 736 x[32,224]（b1 @128）；p1 平台原位 x[383,447] 顶 624
//   （b1 压下东移 64→[447,511]，释放回位；蓝光冻结泳池且永久）；桥（冻结水）512 x[224,608]
//   （冰面：fb 滑行加速 maxSpeed 40m/s、wg 减速 64px/s）；slab-13 416 x[544,1024]（桥面 x[440,515]
//   助跑东跳可上，row-9 实体底 320 高于峰值 box-top 335.5 无磕头）；t0 台 320 x[1120,1248]
//   （slab-13 东端 ~1005 助跑东跳 96px 上，oracle sweep 实证）；row-9 东段 288 x[640,992]
//   （t0 台西跳落东雪 ~885）；绿池 7 杀 x[544,640]（row-9 西跳 645→437 上 mound-A 顶 192 x[320,448]）；
//   波浪路 `\../` 160-192 x[288,448]；闸门 p2 x[256,288] y[64,160]（t0 信号升起 96px，
//   platY 112→15.7；TimedPusher 压住计时重置、松开 4s 回弹）；内室地 160（fb 门 48 / wg 门 152）。
//   岩浆渠 6 x[672,864] 512 面（fb 漂浮 490.9 可涉渡；wg 必死故全程不过渠）。
const SEGI = {
  // 物理口径修正（TEMP/ice02-replay.mjs 逐帧法证 2026-10-28）：实测 rise-96 跳漂移 ~130-135px
  //   （非弹道ideal 208：飞行 ~0.44s、空中水平速衰减、落地 scrub ~60%）——所有起跳线按实测收，
  //   落点统一留台内余量；同高度跳（绿池跨越）为全长飞行 drift ~250-267。
  I0: {
    maxDepth: 14, capFb: 8, capWg: 8,
    recipe: {
      // rj750 落台 ~885（台 864-1024 内 21px）；rj990 自 885 起跑 105px 回满速，drift ~130 落 ~1120
      //   （row-22 内：距西缘 64 / 东缘 128，±1f 平移 ±6px 双侧安全）。
      fb: [spec("runJump", 1, 720, 25), spec("runJump", 1, 940, 25), spec("sleep", 15)],
      wg: [spec("sleep", 45), spec("runJump", 1, 750, 25), spec("runJump", 1, 990, 25), spec("sleep", 15)],
    },
    vocab: {
      fb: [spec("runJump", 1, 720, 25), spec("runJump", 1, 750, 25), spec("runJump", 1, 780, 25),
        spec("runJump", 1, 960, 25), spec("runJump", 1, 975, 25), spec("runJump", 1, 990, 25), spec("runJump", 1, 1005, 25), spec("sleep", 15)],
      wg: [spec("sleep", 30), spec("sleep", 45), spec("sleep", 60),
        spec("runJump", 1, 720, 25), spec("runJump", 1, 750, 25), spec("runJump", 1, 780, 25),
        spec("runJump", 1, 960, 25), spec("runJump", 1, 975, 25), spec("runJump", 1, 990, 25), spec("runJump", 1, 1005, 25), spec("sleep", 15)],
    },
  },
  I1: {
    maxDepth: 12, capFb: 7, capWg: 7,
    recipe: {
      // 实测（TEMP/ice02-i1.mjs 网格 ±1f 全过）：fb 自 1200 西跑 rj1150 落 row-20 [942,605]；
      //   wg rj1090 落 [897,605]；hold 780 步行出西缘 832 落楼梯 D25,21+/24,21，末段 hold690
      //   （雪/冰滑停过冲 ~25px → 终点 ~662-667，I1 target/I2 entry 窗 [640,735] 内双侧余量）。
      // entry 合取口径：整链重放下 fb 的 I0 部分先完（f288），须等 wg 进 row-22 窗（~f455）
      //   才能离窗，否则 entry 永不合取（I1 d1 recipe entry@-1 实证）。waitPx 领头解决；
      //   waitPx 只查 x（wg 空中穿窗 f445 即燃，而她落稳可能晚至 f490——种子带 sleep 变体时
      //   合取窗错过，beam24 实证）→ 后接 walkTo(-1,1160,60) 慢爬 40px 把在窗时间拉长到 ~80f，
      //   再 rj(-1,1120) 冲刺起跳（v~250 drift~215 落 row-20 ~905 中部）。
      fb: [spec("waitPx", "wg", 1060, 1240), spec("hold", -1, 1160), spec("runJump", -1, 1120, 25),
        spec("edgeDrop", -1, 16), spec("hold", -1, 685), spec("walkTo", 1, 700, 60), spec("sleep", 15)],
      wg: [spec("sleep", 20), spec("runJump", -1, 1130, 25), spec("edgeDrop", -1, 16), spec("hold", -1, 685), spec("walkTo", 1, 700, 60), spec("sleep", 15)],
    },
    vocab: {
      fb: [spec("waitPx", "wg", 1060, 1240), spec("hold", -1, 1140), spec("hold", -1, 1160), spec("hold", -1, 1180),
        spec("runJump", -1, 1110, 25), spec("runJump", -1, 1120, 25), spec("runJump", -1, 1130, 25), spec("runJump", -1, 1150, 25),
        spec("edgeDrop", -1, 12), spec("edgeDrop", -1, 16), spec("edgeDrop", -1, 20), spec("hold", -1, 780), spec("hold", -1, 685), spec("walkTo", 1, 690, 60), spec("walkTo", 1, 700, 60), spec("walkTo", 1, 710, 60), spec("sleep", 15)],
      wg: [spec("sleep", 20), spec("runJump", -1, 1120, 25), spec("runJump", -1, 1130, 25), spec("runJump", -1, 1140, 25),
        spec("edgeDrop", -1, 12), spec("edgeDrop", -1, 16), spec("edgeDrop", -1, 20), spec("hold", -1, 780), spec("hold", -1, 685), spec("walkTo", 1, 690, 60), spec("walkTo", 1, 700, 60), spec("walkTo", 1, 710, 60), spec("sleep", 15)],
    },
  },
  I2: {
    maxDepth: 12, capFb: 5, capWg: 10, horizonF: 700,
    recipe: {
      fb: [spec("sleep", 500)],
      wg: [spec("hold", -1, 560), spec("hold", -1, 300), spec("walkTo", -1, 240, 999), spec("jumpDrift", -1, 0, 20),
        spec("walkTo", -1, 128, 999), spec("sleep", 15)],
    },
    vocab: {
      fb: [spec("sleep", 300), spec("sleep", 450), spec("sleep", 600)],
      wg: [spec("hold", -1, 600), spec("hold", -1, 560), spec("hold", -1, 520),
        spec("hold", -1, 340), spec("hold", -1, 300),
        spec("walkTo", -1, 240, 999), spec("walkTo", -1, 260, 999),
        spec("jumpDrift", -1, 0, 15), spec("jumpDrift", -1, 0, 20), spec("jumpDrift", -1, 0, 30),
        spec("walkTo", -1, 128, 999), spec("walkTo", -1, 140, 999), spec("walkTo", -1, 116, 999), spec("sleep", 15)],
    },
  },
  I3: {
    maxDepth: 8, capFb: 5, capWg: 5, horizonF: 480,
    recipe: {
      // I3a 穿池+登首级（604 台 x132-160，28px）：跳冲量随水平速度（站立 38px/全速 ~100px），
      //   登级须退跑到 x60-80 助跑带速起跳 runJump(1,~90,25)（apex ~150 落首级）。fb 首件 waitPx
      //   锚 b1 按压后慢速穿池（按压 f861 起冻 416f）；wg 压板 sleep(30) 锚 entry/冻结后跟进。
      fb: [spec("waitPx", "wg", 105, 170), spec("sleep", 45), spec("walkTo", -1, 300, 999),
        spec("walkTo", -1, 80, 60), spec("runJump", 1, 80, 25), spec("sleep", 10)],
      wg: [spec("sleep", 30), spec("walkTo", -1, 80, 60), spec("runJump", 1, 80, 25), spec("sleep", 10)],
    },
    vocab: {
      fb: [spec("waitPx", "wg", 105, 170), spec("waitPx", "wg", 100, 180),
        spec("sleep", 30), spec("sleep", 45), spec("sleep", 60),
        spec("walkTo", -1, 300, 999), spec("walkTo", -1, 240, 999),
        spec("walkTo", -1, 60, 60), spec("walkTo", -1, 70, 60), spec("walkTo", -1, 80, 60),
        spec("runJump", 1, 80, 25), spec("runJump", 1, 85, 25), spec("runJump", 1, 90, 25),
        spec("runJump", 1, 95, 25), spec("runJump", 1, 100, 25), spec("sleep", 10)],
      wg: [spec("sleep", 20), spec("sleep", 30), spec("sleep", 45),
        spec("walkTo", -1, 60, 60), spec("walkTo", -1, 70, 60), spec("walkTo", -1, 80, 60),
        spec("runJump", 1, 80, 25), spec("runJump", 1, 85, 25), spec("runJump", 1, 90, 25),
        spec("runJump", 1, 95, 25), spec("runJump", 1, 100, 25), spec("sleep", 10)],
    },
  },
  I3b: {
    maxDepth: 8, capFb: 6, capWg: 6, horizonF: 420,
    recipe: {
      // I3b 首级(604@x132-160)→deck-476(x192+)：加速横穿首级 walkTo(1,140,999) 带速至东缘
      //   runJump(1,152,12)（弧穿三角斜瓦 x160-188 下方）落 524 台（x208-236）；jd(-1,0,4) 升 40
      //   落三角顶 484@188；8px 阶 walkTo 上 deck。
      fb: [spec("runJump", 1, 152, 14), spec("walkTo", 1, 215, 999),
        spec("jumpDrift", -1, 0, 4), spec("walkTo", 1, 260, 999), spec("sleep", 10)],
      wg: [spec("runJump", 1, 152, 14), spec("walkTo", 1, 215, 999),
        spec("jumpDrift", -1, 0, 4), spec("walkTo", 1, 260, 999), spec("sleep", 10)],
    },
    vocab: {
      fb: [spec("walkTo", 1, 140, 999), spec("walkTo", 1, 150, 999),
        spec("runJump", 1, 148, 10), spec("runJump", 1, 152, 12), spec("runJump", 1, 152, 14),
        spec("walkTo", 1, 210, 999), spec("walkTo", 1, 215, 999), spec("walkTo", 1, 220, 999),
        spec("jumpDrift", -1, 0, 3), spec("jumpDrift", -1, 0, 4), spec("jumpDrift", -1, 0, 6),
        spec("jumpDrift", 1, 0, 3), spec("jumpDrift", 1, 0, 4),
        spec("walkTo", 1, 260, 999), spec("walkTo", 1, 300, 999), spec("sleep", 10)],
      wg: [spec("walkTo", 1, 140, 999), spec("walkTo", 1, 150, 999),
        spec("runJump", 1, 148, 10), spec("runJump", 1, 152, 12), spec("runJump", 1, 152, 14),
        spec("walkTo", 1, 210, 999), spec("walkTo", 1, 215, 999), spec("walkTo", 1, 220, 999),
        spec("jumpDrift", -1, 0, 3), spec("jumpDrift", -1, 0, 4), spec("jumpDrift", -1, 0, 6),
        spec("jumpDrift", 1, 0, 3), spec("jumpDrift", 1, 0, 4),
        spec("walkTo", 1, 260, 999), spec("walkTo", 1, 300, 999), spec("sleep", 10)],
    },
  },
  I4: {
    maxDepth: 10, capFb: 7, capWg: 7, horizonF: 620,
    recipe: {
      // deck-476 东段助跑东跳 rise96（实测漂 130-135）：x850 起跳落 ~985 beam-380（x664-1024）；
      // 东端 x1000 有 ~292 级、g2 块 x1088-1120 顶 ~320。target 容 beam-380/292/320 全部高位。
      fb: [spec("walkTo", 1, 850, 999), spec("runJump", 1, 870, 25), spec("walkTo", 1, 1000, 999), spec("sleep", 10)],
      wg: [spec("walkTo", 1, 850, 999), spec("runJump", 1, 870, 25), spec("walkTo", 1, 1000, 999), spec("sleep", 10)],
    },
    vocab: {
      fb: [spec("walkTo", 1, 800, 999), spec("walkTo", 1, 850, 999), spec("walkTo", 1, 900, 999),
        spec("runJump", 1, 840, 25), spec("runJump", 1, 860, 25), spec("runJump", 1, 880, 25), spec("runJump", 1, 900, 25),
        spec("jumpDrift", 1, 0, 20), spec("jumpDrift", 1, 0, 25),
        spec("jumpDrift", 1, 0, 4), spec("jumpDrift", 1, 0, 6), spec("jumpDrift", 1, 0, 8),
        spec("walkTo", 1, 950, 999), spec("walkTo", 1, 1000, 999), spec("sleep", 10)],
      wg: [spec("walkTo", 1, 800, 999), spec("walkTo", 1, 850, 999), spec("walkTo", 1, 900, 999),
        spec("runJump", 1, 840, 25), spec("runJump", 1, 860, 25), spec("runJump", 1, 880, 25), spec("runJump", 1, 900, 25),
        spec("jumpDrift", 1, 0, 20), spec("jumpDrift", 1, 0, 25),
        spec("jumpDrift", 1, 0, 4), spec("jumpDrift", 1, 0, 6), spec("jumpDrift", 1, 0, 8),
        spec("walkTo", 1, 950, 999), spec("walkTo", 1, 1000, 999), spec("sleep", 10)],
    },
  },
  I5: {
    maxDepth: 10, capFb: 6, capWg: 6, horizonF: 500,
    recipe: {
      // 高位（beam-380 东端/292 级/上梁 252 东段）西行：292→252 升 40 小跳，之后沿上梁全速西行
      //   至西端斜坡底（x215-430, py 236-312 容 252-rest248 与 288-rest284）。
      fb: [spec("jumpDrift", -1, 0, 6), spec("walkTo", -1, 300, 999), spec("sleep", 10)],
      wg: [spec("jumpDrift", -1, 0, 6), spec("walkTo", -1, 300, 999), spec("sleep", 10)],
    },
    vocab: {
      fb: [spec("jumpDrift", 1, 0, 10), spec("jumpDrift", 1, 0, 14), spec("jumpDrift", 1, 0, 18),
        spec("jumpDrift", -1, 0, 3), spec("jumpDrift", -1, 0, 4), spec("jumpDrift", -1, 0, 6), spec("jumpDrift", -1, 0, 8),
        spec("jumpDrift", -1, 0, 10), spec("jumpDrift", -1, 0, 12), spec("jumpDrift", -1, 0, 14),
        spec("jumpDrift", -1, 0, 16), spec("jumpDrift", -1, 0, 20), spec("jumpDrift", -1, 0, 25),
        spec("walkTo", 1, 1000, 999), spec("walkTo", -1, 300, 999), spec("walkTo", -1, 350, 999),
        spec("walkTo", -1, 400, 999), spec("walkTo", -1, 500, 999), spec("sleep", 10)],
      wg: [spec("jumpDrift", 1, 0, 10), spec("jumpDrift", 1, 0, 14), spec("jumpDrift", 1, 0, 18),
        spec("jumpDrift", -1, 0, 3), spec("jumpDrift", -1, 0, 4), spec("jumpDrift", -1, 0, 6), spec("jumpDrift", -1, 0, 8),
        spec("jumpDrift", -1, 0, 10), spec("jumpDrift", -1, 0, 12), spec("jumpDrift", -1, 0, 14),
        spec("jumpDrift", -1, 0, 16), spec("jumpDrift", -1, 0, 20), spec("jumpDrift", -1, 0, 25),
        spec("walkTo", 1, 1000, 999), spec("walkTo", -1, 300, 999), spec("walkTo", -1, 350, 999),
        spec("walkTo", -1, 400, 999), spec("walkTo", -1, 500, 999), spec("sleep", 10)],
    },
  },
  I6: {
    maxDepth: 14, capFb: 8, capWg: 8, horizonF: 700,
    recipe: {
      // 门位网格测定（TEMP/ice02-door.mjs）：fb 龛 (x56-104, py181)、wg 龛 (x192-208, py181) 站定即
      //   isOpen，双门 frac 51f 同升 → won。fb 自上梁西端 (~200,248) 满跳西漂 130 直落龛内；
      //   wg 先西至坡顶平台 (128-192@192) 东踏 8px 阶上龛。
      fb: [spec("jumpDrift", -1, 0, 25), spec("sleep", 10)],
      wg: [spec("walkTo", -1, 180, 60), spec("jumpDrift", 1, 0, 5), spec("sleep", 10)],
    },
    vocab: {
      fb: [spec("jumpDrift", -1, 0, 16), spec("jumpDrift", -1, 0, 20), spec("jumpDrift", -1, 0, 25), spec("jumpDrift", -1, 0, 28),
        spec("jumpDrift", -1, 0, 4), spec("jumpDrift", -1, 0, 6), spec("jumpDrift", -1, 0, 8),
        spec("walkTo", -1, 60, 60), spec("walkTo", -1, 80, 60), spec("walkTo", -1, 100, 60), spec("walkTo", -1, 120, 60),
        spec("walkTo", -1, 150, 60), spec("walkTo", -1, 180, 60), spec("walkTo", -1, 130, 999), spec("sleep", 10)],
      wg: [spec("walkTo", -1, 150, 60), spec("walkTo", -1, 170, 60), spec("walkTo", -1, 185, 60),
        spec("walkTo", -1, 100, 60), spec("walkTo", -1, 120, 60),
        spec("jumpDrift", 1, 0, 3), spec("jumpDrift", 1, 0, 4), spec("jumpDrift", 1, 0, 5), spec("jumpDrift", 1, 0, 6), spec("jumpDrift", 1, 0, 8),
        spec("jumpDrift", -1, 0, 4), spec("jumpDrift", -1, 0, 6), spec("jumpDrift", -1, 0, 8),
        spec("walkTo", 1, 195, 60), spec("walkTo", 1, 205, 60), spec("walkTo", 1, 215, 60), spec("sleep", 10)],
    },
  },
};
Object.assign(SEG, SEGI);

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
  let Sx = null;
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
      try { inp = stp.run(ctx); } catch (e) { if (process.env.AS_TRACE) console.error(`[throw-run] ${role}#${idx[role]} f${f}: ${e.message}`); inp = NONE; }
      const next = { up: !!(inp?.up), left: !!(inp?.left), right: !!(inp?.right) };
      state[role] = next;
      inputs[role] = next;
      let d = false;
      try { d = stp.done(ctx); } catch (e) { if (process.env.AS_TRACE) console.error(`[throw-done] ${role}#${idx[role]} f${f}: ${e.message}`); d = false; }
      if (d) { idx[role]++; if (process.env.AS_TRACE) console.error(`[idx] ${role}->${idx[role]} f${f} ${stp.name ?? "?"}`); if (idx[role] >= progs[role].length) drainF[role] = f; }
    }
    w.step(1 / 60, { fireboy: inputs.fb, watergirl: inputs.wg });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) {
      deathF = f; deadWho = (a.dead || a.dying ? "fb" : "wg") + "@[" + (a.dead || a.dying ? a.x : b.x).toFixed(0) + "," + (a.dead || a.dying ? a.y : b.y).toFixed(0) + "]";
      endF = f; break;
    }
    // 断言取 step 后状态（verify-chain.mjs/E1 同口径：step→逐帧联合求值）
    Sx = {
      fb: { x: a.x, y: a.y, vx: a.vx, vy: a.vy, atDoor: a.atDoor, grounded: w.players.fireboy.feetContacts.length > 0, dead: a.dead || a.dying },
      wg: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, atDoor: b.atDoor, grounded: w.players.watergirl.feetContacts.length > 0, dead: b.dead || b.dying },
    };
    const Mx = w.mechSnapshot();
    const Dx = { won: w.phase === "won", doors: w.doors };
    if (entryF < 0 && allS(segC.entryG, Sx, Mx, Dx)) { entryF = f; entryS = Sx; }
    if (process.env.AS_DBG === segC.id && f % 40 === 0) {
      const t = (g, name) => { try { return allS([g], Sx, Mx, Dx) ? 1 : 0; } catch { return "E"; } };
      log(`    [dbg${segC.id}] f${f} fb[${a.x.toFixed(0)},${a.y.toFixed(0)},g${w.players.fireboy.feetContacts.length > 0 ? 1 : 0}] wg[${b.x.toFixed(0)},${b.y.toFixed(0)},g${w.players.watergirl.feetContacts.length > 0 ? 1 : 0}] P1y=${(Mx.platforms[1]?.y ?? -1).toFixed(0)} entry=${entryF >= 0 ? entryF : "no"} terms=[plat,fbx,fby,wgx,wgy]=${segC.entryG.map((g) => t(g)).join(",")}`);
    }
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
    if (!ok.ok) { fatal++; groups.push({ side: pick.side, i: pick.i, f: evs[pick.side][pick.i].f, dir }); }
  }
  return { fatal, groups };
}
/** 穷举 ±1f 采样（定稿验收门，2026-10-16 绿路线 fatal=0/222 实证本关存在全鲁棒解）：
 *  本段新增跨度（f≥minF）每事件 ±1 各一次，任一 fatal 即早退。每事件恰属一段的新增
 *  跨度 ⇒ 逐段穷举 = 整关穷举。 */
function exhaustiveSample(baseEvents, segC, deadlineAbsF, minF = 0) {
  const all = [];
  for (const side of ["fb", "wg"]) for (let i = 0; i < baseEvents[side].length; i++) { if (baseEvents[side][i].f < minF) continue; all.push({ side, i }); }
  for (const { side, i } of all) {
    for (const dir of [-1, 1]) {
      const T = { fb: baseEvents.fb.map((e) => ({ ...e })), wg: baseEvents.wg.map((e) => ({ ...e })) };
      T[side][i].f += dir;
      const rr = replayEventRoute(T, segC, deadlineAbsF);
      if (!rr.ok) return { fatal: 1, groups: [{ side, i, f: baseEvents[side][i].f, dir, ev: baseEvents[side][i], why: rr.why }] };
    }
  }
  return { fatal: 0, groups: [] };
}
/** 扰动事件表回放：requireMet=true 时死亡或 deadlineAbsF 内 target 未达 → false；
 *  false 时仅死亡判 fatal（层内非 met 候选的存活鲁棒度判据，到 deadline 仍活着即通过） */
function replayEventRoute(T, segC, deadlineAbsF, requireMet = true) {
  const w = makeWorld(LEVEL);
  const ins = expandFlat(T.fb, T.wg, deadlineAbsF + 2);
  let met = false, Sx = null;
  for (let f = 0; f <= deadlineAbsF; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) return { ok: false, why: `die@${f} fb[${a.x.toFixed(0)},${a.y.toFixed(0)}] wg[${b.x.toFixed(0)},${b.y.toFixed(0)}]` };
    Sx = {
      fb: { x: a.x, y: a.y, vx: a.vx, vy: a.vy, atDoor: a.atDoor, grounded: w.players.fireboy.feetContacts.length > 0, dead: a.dead || a.dying },
      wg: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, atDoor: b.atDoor, grounded: w.players.watergirl.feetContacts.length > 0, dead: b.dead || b.dying },
    };
    const Mx = w.mechSnapshot();
    const Dx = { won: w.phase === "won", doors: w.doors };
    if (allS(segC.targetG, Sx, Mx, Dx)) { met = true; break; }
  }
  if (!requireMet) return { ok: true, why: "alive" };
  if (!met) return { ok: false, why: `no-met fb[${Sx?.fb.x.toFixed(0) ?? "?"},${Sx?.fb.y.toFixed(0) ?? "?"}] wg[${Sx?.wg.x.toFixed(0) ?? "?"},${Sx?.wg.y.toFixed(0) ?? "?"}]` };
  return { ok: true, why: "met" };
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
    log(`  ${segDef.id} d${depth}: evals=${evals} best=${b.score.toFixed(0)} wp=${b.unlocked}/${segC.wpG.length} met=${b.met} rob=${layers.at(-1).rob ?? "-"} entry@${b.r.entryF} fb=[${layers.at(-1).fb}] wg=[${layers.at(-1).wg}] prog fb=${progNames(b.sf)} | wg=${progNames(b.sw)}`);
    if (b.met) {
      // met 不即停：先试定稿阶梯，seam 过关才收（早熟脆家系 met 会饿死下段——v4 实证
      // d8 4原语落窗即坠家系抢跑）；不过则继续加深让鲁棒家系上位，快照首个 met 前沿兜底
      const finTry = finalizeSegment({ beam }, segDef, prefixF, opts.nextDef ?? null);
      if (finTry && finTry.exhaustiveFatal === 0 && (finTry.seamEntryF >= 0 || !opts.nextDef)) { solved = b; break; }
      if (!metBeam) metBeam = beam;
    }
    if (evals > BUDGET) { log(`  ${segDef.id} evals 预算耗尽（${BUDGET}）`); exhausted = true; break; }
    if ((Date.now() - opts.t0) / 1000 > opts.wallBudgetS) { log(`  ${segDef.id} 墙钟预算耗尽`); exhausted = true; break; }
  }
  if (!solved && metBeam) { solved = metBeam.find((n) => n.met) ?? null; beam = metBeam; }
  return {
    id: segDef.id, title: segDef.title, horizonF: segC.horizonF, maxDepth,
    seedFb, seedWg,
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
  // 池按程序前缀签名去重（同族 padding 候选挤占 top-8 会饿死异族鲁棒组合，exha-s0a2 实证）
  const pool = [];
  const seenFam = new Set();
  const sFb = segRes.seedFb ?? 0, sWg = segRes.seedWg ?? 0;
  for (const n of segRes.beam) {
    if (!n.met) continue;
    const R = n.r ?? {};
    // key 用本段新增后缀（链式段候选共享种子前缀，前缀 key 会把池饿到 1 族——I1 实证）
    const key = progNames((n.sf ?? []).slice(sFb)) + "|" + progNames((n.sw ?? []).slice(sWg));
    if (seenFam.has(key)) continue;
    seenFam.add(key);
    pool.push(n);
    if (pool.length >= 8) break;
  }
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
        const rec = { cand: trimmed, inline: { fatal: SAMPLES, groups: [] }, exhaustiveFatal: 1, score2: -1e6, seamEntryF: -1, trimDepth: [kFb, kWg] };
        if (!best) best = rec;
        continue;
      }
      const deadlineAbsF = (cand.entryF >= 0 ? cand.entryF : 0) + segC.horizonF;
      let seamEntryF = -1, seamWhy = "";
      if (nextC) {
        const nr = evaluate(nextC, trimmed.sf, trimmed.sw, cand.endF + SEAM_GRACE_F + 120);
        const sv = seamOkNr(nr, trimmed, nextC);
        if (sv === true) seamEntryF = nr.entryF; else seamWhy = String(sv);
      }
      // 穷举 ±1f 验收门（seam 过后对本段新增事件全量扰动；绿路线 fatal=0/222 实证可达）
      let exFatal = 1, exGroups = [];
      if (seamEntryF >= 0 || !nextC) {
        const ex = exhaustiveSample(dr.events, segC, deadlineAbsF, Math.max(0, cand.entryF));
        exFatal = ex.fatal; exGroups = ex.groups;
      }
      const rec = { cand: trimmed, events: dr.events, inline: { fatal: exFatal, groups: exGroups }, exhaustiveFatal: exFatal, score2: cand.score - 500 * exFatal, seamEntryF, trimDepth: [kFb, kWg] };
      log(`    fin[${node.name ?? "?"}] try[${kFb},${kWg}] seam=${seamEntryF}${seamWhy ? " (" + seamWhy + ")" : ""} exFatal=${exFatal}${exGroups.length ? " groups=" + JSON.stringify(exGroups).slice(0, 220) : ""}`);
      const acc = (r) => ((r.seamEntryF >= 0 || !nextC) && r.exhaustiveFatal === 0 ? 1 : 0);
      if (!best || acc(rec) - acc(best) > 0) best = rec;
      else if (acc(rec) === acc(best) && rec.score2 > best.score2) best = rec;
      if (best && acc(best) === 1) break; // 已获穷举鲁棒定稿（优先浅剪），停止加保留
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
  if (nr.entryF < 0 || !nr.entryS) return "entry-no-fire";
  const drained = nr.idxEnd.fb >= trimmed.sf.length && nr.idxEnd.wg >= trimmed.sw.length;
  if (!drained) return `not-drained idx=${nr.idxEnd.fb}/${trimmed.sf.length},${nr.idxEnd.wg}/${trimmed.sw.length}`;
  const pre = (r) => nr.drainF[r] >= 0 && nr.entryF <= nr.drainF[r];
  const moving = (r) => Math.abs(nr.entryS[r].vx) > 25;
  for (const r of ["fb", "wg"]) if (moving(r) && !pre(r)) return `moving-${r}-post-drain`;
  if (nextC && !allS(nextC.entryG, nr.S, nr.M, nr.D)) return `end-state-evaporated fb[${nr.S.fb.x.toFixed(0)},${nr.S.fb.y.toFixed(0)}] wg[${nr.S.wg.x.toFixed(0)},${nr.S.wg.y.toFixed(0)}]`;
  return true;
}

/** seam 校验（§9-3）：对【修剪后】定稿程序以 evaluate 重放，逐帧查下一段 entryG（含死亡短路）。
 *  旧版先断言修剪前存储终态 = 假阳性（修剪剪掉的在飞原语弧线可能正是入窗穿越，S0b 饥饿实证），废除。 */
function seamCheck(final, nextSegDef) {
  const nextC = segCtxOf(nextSegDef);
  const nr = evaluate(nextC, final.cand.sf, final.cand.sw, final.cand.endF + SEAM_GRACE_F + 120);
  if (seamOkNr(nr, final.cand, nextC) !== true) return { ok: false };
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
  // --forcestart N：配方返工时强制从段 N 重搜（种子仍取前一最终稿的累积程序前缀）
  if (argOf("forcestart")) startIdx = Math.max(segRange[0], Number(argOf("forcestart")));
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
  log(`  ${segDef.id} 定稿: score'=${fin.score2.toFixed(0)} 穷举Fatal=${fin.exhaustiveFatal ?? "?"} end@f${fin.cand.endF} trim=${(fin.trimDepth ?? []).join("/")} seamEntry@${fin.seamEntryF ?? "-"}`);

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

// r02 路线求解 bot 核心：双角色步骤机 → 内核逐帧驱动 → 平坦事件 JSON
// 用法（被各关卡脚本 import）：driver(world, programs, {totalFrames, onFrame})
//
// ── 迁移档案（botrevive 槽，2026-10-15）────────────────────────────────────
// 本文件由断点收容本机械迁移入库，正文逐字保真（不改行为语义、不新增功能）。
// 来源对照：
//   [主本] note/evidence/forest_05/tools/breakpoint-r05d/botcore.mjs
//          （与 TEMP/r05f/tools/botcore.mjs 逐字节一致，diff 空）
//   [变体] note/evidence/forest_02/tools/botcore.mjs
//   [S2 出处] note/evidence/forest_05/tools/breakpoint-r05d/bot3-f05.mjs:31-86
//
// 两本收容本 diff 清单（仅 1 处）：
//   + drive 循环帧首 `opts.onFrame?.(f);` —— 主本（r05d）有、变体（f02）无。
//     本文件从主本保留（opts 可选，未传时零行为差异）。
//   - 其余（NONE/S/drive/toRouteDoc）两本逐字相同。
//
// S2 来源勘误（对派单前提的实证修正）：
//   - brakedHop/edgeDrop 在两本 botcore.mjs 中均【不存在】，真实定义于主本同目录的
//     bot3-f05.mjs（r05c 期 per-level 扩展，见上 [S2 出处]）。本文件按 bot3-f05.mjs
//     原文补入 S2 = { brakedHop, edgeDrop }（逐字）。
//   - bot3-f05.mjs 的 S2 还本地重定义了 settle/wait/sleep/hold/runJump（与 S 同名
//     复制品，其中 runJump.done 的 air 标记多了 `jumped &&` 前置条件，与 S.runJump
//     存在微差）。为避免双份同名原语歧义，这些复制品【不】随 S2 导出；S.runJump 为
//     唯一正本。调用方需要微差版可自行内联。
//   - 派单所述 f02 变体"含电梯/桥/摆板谓词"：实为 bot-f02.mjs（per-level 谓词脚本，
//     import 本库使用），不在 botcore.mjs 内，未迁移。
//
// import 依赖说明：
//   botcore 本体零 import（纯函数库，world 实例由调用方经 ./kernel.mjs 的 makeWorld
//   注入）。收容期"TEMP 相对路径依赖"存在于 per-level 驱动脚本（bot3-f05.mjs 等
//   以 `../../scripts/e2e/routetool/kernel.mjs` 相对引用，仅在 TEMP/<槽>/tools/ 下
//   才成立）；入库后内核与 botcore 同目录（./kernel.mjs），该依赖自然消除。
//
// 最小用法：
//   import { makeWorld, runKernel } from "./kernel.mjs";        // 同目录内核
//   import { NONE, S, S2, drive, toRouteDoc } from "./botcore.mjs";
//   const w = makeWorld("forest_01");
//   const r = drive(w, { fb: [S.settle(), S.goTo(500, 6)], wg: [S.settle()] }, 900);
//   if (r.result.won) writeFileSync("route.json", JSON.stringify(
//     toRouteDoc("forest_01", r.events, r.result.winF + 3, "my-bot")));
// ──────────────────────────────────────────────────────────────────────────
export const NONE = { up: false, left: false, right: false };

/** 步骤构造器（每步 = {run(ctx)->input|null, done(ctx)->bool, name}）
 * ctx: {f, w, me:{x,y,vx,vy,grounded,dead}, other, mem} —— mem 为本步内可变暂存
 */
export const S = {
  /** 等待落地静止 */
  settle: (name = "settle") => ({
    name,
    run: () => NONE,
    done: (c) => c.me.grounded && Math.abs(c.me.vy) < 8 && Math.abs(c.me.vx) < 8,
  }),
  /** 无输入等待谓词 */
  wait: (pred, name = "wait") => ({ name, run: () => NONE, done: pred }),
  /** 定帧等待 */
  sleep: (n, name = "sleep" + n) => {
    let t = 0;
    return { name, run: () => NONE, done: (c) => ++t >= n };
  },
  /** 按住某键直到谓词（长按进墙风格） */
  hold: (dir, pred, name = "hold" + dir) => ({ name, run: () => ({ ...NONE, [dir]: true }), done: pred }),
  /** 朝 x 走：预刹车 + 3 帧最小输入驻留（防 1-2 帧抖动脉冲污染路线事件表） */
  goTo: (x, tol = 14, name = "go" + x) => {
    let cur = 0, lastF = -9;
    return {
      name,
      run: (c) => {
        const d = x - c.me.x;
        const vx = c.me.vx;
        let want = d > 0 ? 1 : -1;
        if (Math.abs(d) <= tol) want = Math.abs(vx) > 50 ? -Math.sign(vx) : 0;
        else {
          const closing = (vx > 0) === (d > 0);
          if (closing && Math.abs(vx) > 40 && Math.abs(d) < Math.abs(vx) * 0.16 + 10) want = -Math.sign(vx);
        }
        if (want !== cur && c.f - lastF >= 3) { cur = want; lastF = c.f; }
        return cur === 0 ? NONE : { ...NONE, [cur > 0 ? "right" : "left"]: true };
      },
      done: (c) => Math.abs(c.me.x - x) <= tol && c.me.grounded && Math.abs(c.me.vx) < 40,
    };
  },
  /** 原地跳一下（1 帧 tap，仅落地时触发） */
  jump: (name = "jump") => {
    let fired = false;
    return {
      name,
      run: () => (fired ? NONE : { ...NONE, up: true }),
      done: (c) => {
        if (!fired && c.me.grounded && !c.mem.jumpHeld) fired = true;
        return fired && !c.me.grounded;
      },
    };
  },
  /** 跳 + 方向漂移：落地即跳（持速起跳），空中保持 dir 共 holdF 帧（holdF≥900=全程含落地瞬间），
   *  完成=再次落地（防漂浮下降段提前交棒导致无输入滑坡） */
  jumpDrift: (dir, preF, holdF, name = "jd" + dir) => {
    let t = 0, jumped = false, air = false;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (!jumped) {
          if (c.me.grounded) { i.up = true; jumped = true; t = 0; return i; }
          return { ...NONE }; // 意外空中：等待落地再跳
        }
        t++;
        if (holdF < 900 && t > holdF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 纯垂直起跳，升过 aboveY 后压 dir 漂移直到落地（贴墙跳台阶用） */
  jumpOnto: (dir, aboveY, name = "jo" + dir) => {
    let jumped = false;
    return {
      name,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded && Math.abs(c.me.vx) < 15) return { ...NONE, up: true };
          if (!c.me.grounded) jumped = true; // 意外离地（防误判）
          return { ...NONE };
        }
        return c.me.y < aboveY ? { ...NONE, [dir]: true } : NONE;
      },
      done: (c) => jumped && c.me.grounded && c.me.vy >= -8,
    };
  },
  /** 助跑跳：从起跳线 hold dir 累积速度，x 越过 line 且落地即跳，空中继续压方向直到落地 */
  runJump: (dir, line, name = "rj" + dir + line) => {
    let jumped = false, air = false;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (!jumped && c.me.grounded && (dir === "right" ? c.me.x >= line : c.me.x <= line)) { i.up = true; jumped = true; }
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded; },
    };
  },
  /** 站定（无输入）——门/推钮驻留 */
  stand: (pred, name = "stand") => ({ name, run: () => NONE, done: pred }),
};

/** 扩展原语 S2（r05c 期实战件，原文迁移自 bot3-f05.mjs:31-86，见文件头勘误） */
export const S2 = {
  /** 刹车跳：落地驻留 3 帧后垂直起跳（可携带 ≤160 动量），升过 aboveY 后朝 dir 漂，
   *  越过 brakeAtX 后压反向真刹车（vx 同向 >30 才压），慢了就松手滑行，落地完成 */
  brakedHop: (dir, aboveY, brakeAtX, name = "bh" + dir + brakeAtX) => {
    let jumped = false, gF = 0;
    const anti = dir === "right" ? "left" : "right";
    return {
      name,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded) { gF++; if (gF >= 3 && Math.abs(c.me.vx) < 160) return { ...NONE, up: true }; }
          else gF = 0;
          if (!c.me.grounded) jumped = true; // 意外离地
          return { ...NONE };
        }
        const past = dir === "right" ? c.me.x >= brakeAtX : c.me.x <= brakeAtX;
        if (c.me.y < aboveY && !past) return { ...NONE, [dir]: true };
        if (past) {
          const moving = dir === "right" ? c.me.vx > 30 : c.me.vx < -30;
          return moving ? { ...NONE, [anti]: true } : NONE;
        }
        return NONE;
      },
      done: (c) => jumped && c.me.grounded && c.me.vy >= -8,
    };
  },
  /** 缘口坠落：朝 dir 蠕 2 帧出缘，空中压反向 holdF 帧后真刹（同向>30 才压），落地完成 */
  edgeDrop: (dir, holdF, name = "ed" + dir) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false;
    return {
      name,
      run: (c) => {
        if (!off) {
          if (t >= 2 && !c.me.grounded) { off = true; t = 0; return { ...NONE, [anti]: true }; }
          if (t < 2) { t++; return { ...NONE, [dir]: true }; }
          return { ...NONE, [dir]: true };
        }
        t++;
        if (t <= holdF) return { ...NONE, [anti]: true };
        const moving = dir === "right" ? c.me.vx < -30 : c.me.vx > 30;
        return moving ? { ...NONE, [dir]: true } : NONE;
      },
      done: (c) => off && c.me.grounded && c.me.vy >= -8,
    };
  },
};

/** 驱动：programs = {fb:[steps], wg:[steps]}；返回 {events, trace, result} */
export function drive(w, programs, totalFrames, opts = {}) {
  const idx = { fb: 0, wg: 0 };
  const state = { fb: { ...NONE }, wg: { ...NONE } };
  const events = { fb: [], wg: [] };
  const trace = [];
  const snapOf = (role) => {
    const s = w.snapshotPlayer(role);
    const c = w.players[role];
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: c.feetContacts.length > 0, dead: s.dead || s.dying };
  };
  for (let f = 0; f < totalFrames; f++) {
    opts.onFrame?.(f);
    const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
    for (const role of ["fb", "wg"]) {
      const prog = programs[role];
      const step = prog[idx[role]];
      if (!step) continue;
      const ctx = {
        f, w, me: meS[role], other: meS[role === "fb" ? "wg" : "fb"],
        mem: (step._mem ??= {}),
        jumpHeld: state[role].up,
      };
      let inp = null;
      try { inp = step.run(ctx); } catch (e) { inp = NONE; }
      const next = { up: !!(inp?.up), left: !!(inp?.left), right: !!(inp?.right) };
      for (const k of ["up", "left", "right"]) {
        if (next[k] !== state[role][k]) events[role].push({ f, dir: k, type: next[k] ? "down" : "up" });
      }
      state[role] = next;
      let d = false;
      try { d = step.done(ctx); } catch { d = false; }
      if (d) { idx[role]++; if (opts.logSteps) console.log(`[bot] f${f} ${role} 完成 ${step.name} → ${prog[idx[role]]?.name ?? "END"}`); }
    }
    w.step(1 / 60, { fireboy: state.fb, watergirl: state.wg });
    if (opts.traceEvery && f % opts.traceEvery === 0) {
      trace.push({ f, fb: [meS.fb.x.toFixed(1), meS.fb.y.toFixed(1)], wg: [meS.wg.x.toFixed(1), meS.wg.y.toFixed(1)], ph: w.phase });
    } else if (opts.traceAll) {
      const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
      trace.push({ f, fb: [+a.x.toFixed(1), +a.y.toFixed(1)], fbv: [+a.vx.toFixed(0), +a.vy.toFixed(0)], wg: [+b.x.toFixed(1), +b.y.toFixed(1)], wgv: [+b.vx.toFixed(0), +b.vy.toFixed(0)] });
    }
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) return { events, trace, result: { won: false, deathF: f, who: a.dead || a.dying ? "fb" : "wg" } };
    if (w.phase === "won") return { events, trace, result: { won: true, winF: f } };
  }
  return { events, trace, result: { won: false, deathF: -1 } };
}

/** 事件表 → 路线 JSON 文档 */
export function toRouteDoc(level, events, totalFrames, source) {
  const clean = (arr) => arr.filter((e, i) => !(i > 0 && arr.slice(0, i).some((p) => p.f === e.f && p.dir === e.dir && p.type === e.type)));
  return {
    level,
    source,
    tickHz: 60,
    totalFrames,
    fb: events.fb.map((e) => ({ f: e.f, dir: e.dir, type: e.type })),
    wg: events.wg.map((e) => ({ f: e.f, dir: e.dir, type: e.type })),
  };
}

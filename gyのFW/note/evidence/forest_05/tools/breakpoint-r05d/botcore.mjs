// r02 路线求解 bot 核心：双角色步骤机 → 内核逐帧驱动 → 平坦事件 JSON
// 用法（被各关卡脚本 import）：driver(world, programs, {totalFrames, onFrame})
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

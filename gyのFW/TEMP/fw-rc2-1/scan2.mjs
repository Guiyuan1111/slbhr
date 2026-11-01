// scan2（fw-route-crystal2 槽）：主地板(611,256) → stack 顶(x[544,576] top192) → tower-2
// 顶(x[512,544] top96) 两跳 2D 扫描。jd 语义对齐 mini-final 实证（f0 up+dir，f1..holdF
// 持方向，共 totalF 帧）。hop1 从 descent 末端走位线 WXA 起跳（holdF=FH1 控漂移，目标
// 落 stack 顶 [544,576] 且不撞 tower-2 东面 544）；hop2 从落点直接起跳（holdF=FH2，目标
// 越 tower-2 顶 96 或角蹬弹出），终点判据 = grounded 且 x≤508（塔2 西缘外，随后可走入门带）。
import { makeWorld } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs";
import { NONE, S } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/botcore.mjs";

const ds = (d) => (d > 0 ? "right" : "left");
const UPW = 25;
const wrapTap = (stp) => { const orig = stp.run.bind(stp); let jAt = -1, airAfter = false;
  stp.run = (ctx) => { if (ctx.f <= 1) return NONE;
    const inp = orig(ctx) || NONE;
    if (inp.up) { jAt = ctx.f; }
    else if (jAt >= 0 && ctx.f <= jAt + UPW - 1) { inp.up = true; }
    if (jAt >= 0 && !ctx.me.grounded) airAfter = true;
    return inp; };
  stp.done = (c) => jAt >= 0 && airAfter && c.me.grounded && c.me.vy >= -8;
  return stp; };
const PRIM = {
  sleep: (...a) => S.sleep(...a),
  hold: (d, xLine) => S.hold(ds(d), (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine)),
  jumpDrift: (d, ...a) => wrapTap(S.jumpDrift(ds(d), ...a)),
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
  jd1f: (d, holdF, totalF) => ({ name: `jd1f${d}`,
    run: (c) => { const st = c.mem; const t = (st.t = (st.t ?? -1) + 1);
      const D = d > 0 ? "right" : "left";
      if (t === 0) return { ...NONE, up: true, [D]: true };
      if (t <= holdF) return { ...NONE, [D]: true };
      return NONE; },
    done: (c) => (c.mem.t ?? 0) >= totalF }),
  jd1fL: (d, holdF, totalF) => ({ name: `jd1fL${d}`,
    run: (c) => { const st = c.mem; const t = (st.t = (st.t ?? -1) + 1);
      const D = d > 0 ? "right" : "left";
      if (t === 0) return { ...NONE, up: true, [D]: true };
      if (t <= holdF) return { ...NONE, [D]: true };
      return NONE; },
    done: (c) => ((c.mem.t ?? 0) >= 30 && c.me.grounded && c.me.vy >= -8) || (c.mem.t ?? 0) >= totalF }),
};
const spec = (n, ...a) => ({ n, a });
const stepOf = (sp) => PRIM[sp.n](...sp.a);

// fb C0..C3 前缀（probe42 PROG.fb idx0..19 原文，已实证：TP→(1206,94)→西行走位落主地板 ~611）
const PREFIX = [
  spec("sleep", 220), spec("sleep", 3),
  spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 40),
  spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 40),
  spec("jumpDrift", -1, 0, 40), spec("sleep", 40),
  spec("hold", -1, 420), spec("sleep", 15),
  spec("hold", 1, 488), spec("sleep", 40),
  spec("sleep", 120),
  spec("jumpDrift", -1, 0, 40), spec("jumpDrift", -1, 0, 32), spec("jumpDrift", -1, 0, 40),
  spec("jumpDrift", -1, 0, 55), spec("sleep", 40),
];

function trial(fh1, fh2, wxa, log) {
  const w = makeWorld("crystal_03");
  const idx = { fb: 0 }; const state = { fb: { ...NONE } };
  const steps = [...PREFIX.map(stepOf), ...[
    spec("walkTo", -1, wxa, 60),        // descent 末端走位（620=fb 实证末端 ~611）
    spec("jd1fL", -1, fh1, 110),        // hop1: 越上 stack 顶（落地即断）
    spec("jd1fL", -1, fh2, 110),        // hop2: 即刻二跳越 tower-2
    spec("sleep", 30),
    spec("walkTo", -1, 441, 60),        // 门带走步（判据前置：x≤508 即视为过塔）
    spec("sleep", 600),
  ].map(stepOf)];
  const snap = () => { const s = w.snapshotPlayer("fireboy");
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: w.players.fireboy.feetContacts.length > 0, dead: s.dead || s.dying, door: s.atDoor }; };
  const events = []; let last = snap(); let hop1Land = null, hop2Land = null, phase = 0;
  let f = 0;
  for (f = 0; f < 4000; f++) {
    const stp = steps[idx.fb]; if (!stp) break;
    const me = snap();
    const inp = stp.run({ f, w, me, other: me, mem: (stp._mem ??= {}), jumpHeld: state.fb.up });
    state.fb = { up: !!inp?.up, left: !!inp?.left, right: !!inp?.right };
    if (stp.done({ f, w, me, other: me, mem: stp._mem })) idx.fb++;
    w.step(1 / 60, { fireboy: state.fb, watergirl: { ...NONE } });
    const a = snap();
    if (!last.grounded && a.grounded && phase === 1 && hop1Land === null) hop1Land = { x: a.x, feet: a.y + 35.2 };
    if (!last.grounded && a.grounded && phase === 2 && hop2Land === null) hop2Land = { x: a.x, feet: a.y + 35.2 };
    if (idx.fb >= PREFIX.length + 1 && phase < 1) { phase = 1; }   // hop1 jd1f 激活
    if (idx.fb >= PREFIX.length + 2 && phase < 2) { phase = 2; }   // hop2 jd1f 激活
    if (Math.hypot(a.x - last.x, a.y - last.y) > 80) events.push(`TP@${f}`);
    if (a.dead) return { res: "DEAD", f };
    last = a;
    if (log) console.log(`  f${f} idx${idx.fb} [${a.x.toFixed(1)},${(a.y + 35.2).toFixed(1)}] g${a.grounded ? 1 : 0} vx${a.vx.toFixed(1)}`);
  }
  const e = snap();
  return { res: e.door ? "DOOR" : e.x <= 508 && e.grounded ? "WEST" : "EAST", f, end: { x: +e.x.toFixed(1), feet: +(e.y + 35.2).toFixed(1) }, hop1: hop1Land, hop2: hop2Land, ev: events.join(",") };
}

const grid = [];
for (const fh1 of [10, 15, 20, 25, 30]) for (const fh2 of [40, 60, 80, 100]) grid.push([fh1, fh2, 620]);
console.log("== scan2: hop1(holdF) x hop2(holdF), takeoff walkTo(-1,620) ==");
for (const [h1, h2, wx] of (process.env.DBG ? [[15,60,620]] : grid)) {
  const r = trial(h1, h2, wx, !!process.env.DBG);
  console.log(`fh1=${h1} fh2=${h2} -> ${r.res} f=${r.f} end=${JSON.stringify(r.end)} hop1=${JSON.stringify(r.hop1)} hop2=${JSON.stringify(r.hop2)} ${r.ev}`);
}

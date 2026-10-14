// r25c 探针 9：f1120 弹跳点 fixture 查询 —— 到底站在什么上
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
let phase = "A", sub = 0;
for (let f = 0; f <= 1130; f++) {
  const inp = f < 90 ? N : (() => {
    const p = w.snapshotPlayer("fireboy");
    const mark = (n2) => { if (phase !== n2) { phase = n2; sub = 0; } };
    switch (phase) {
      case "A": if (p.x < 860) mark("B"); return L;
      case "B":
        if (Math.abs(p.vx) < 3 && p.x > 826 && p.x < 855) { sub++; return sub % 12 < 3 ? L : N; }
        if (p.y > 130) mark("C"); return N;
      case "C": if (p.y > 205 && Math.abs(p.vy) < 5) mark("D"); return N;
      case "D": if (p.x > 1000) mark("E"); return R;
      case "E": sub++; if (p.y > 300) mark("F"); return sub % 10 < 4 ? R : N;
      case "F": if (p.y > 335 && p.y < 365 && Math.abs(p.vy) < 5) mark("G"); return N;
      case "G": if (p.y > 420) mark("G2"); return R;
      case "G2": if (p.y > 715 && p.y < 755 && Math.abs(p.vy) < 5) mark("I"); return N;
      case "I": if (p.x < 1022) mark("J"); return L;
      case "J":
        if (Math.abs(p.vx) < 3) { sub++; if (sub > 8 && sub < 48) return UL; return N; }
        return N;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: inp, watergirl: N });
}
const p = w.snapshotPlayer("fireboy");
console.log(`fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) v=(${p.vx.toFixed(1)},${p.vy.toFixed(1)}) ${p.anim}`);
// 查询她脚下 (y+35.2) 与全身范围内所有覆盖 fixture
const b2w = w.built.world;
const toB2 = (sx, sy) => ({ x: -sx / 32, y: -sy / 32 });
const targets = [
  ["feet", p.x, p.y + 30], ["feet2", p.x, p.y + 35],
  ["body", p.x, p.y], ["head", p.x, p.y - 30],
  ["east-half", p.x + 12, p.y + 30],
];
function* iterBodies(world) { let b = world.GetBodyList(); while (b) { yield b; b = b.GetNext(); } }
function* iterFix(body) { let fx = body.GetFixtureList(); while (fx) { yield fx; fx = fx.GetNext(); } }
for (const [label, sx, sy] of targets) {
  const pt = toB2(sx, sy);
  const hits = [];
  for (const b of iterBodies(b2w)) for (const fx of iterFix(b)) {
    try { if (fx.testPoint(pt)) hits.push(describe(b, fx)); } catch { }
  }
  console.log(`[${label}] screen(${sx.toFixed(0)},${sy.toFixed(0)}):`, hits.length ? hits.join(" | ") : "(none)");
}
function describe(b, fx) {
  const ud = b.GetUserData();
  const pos = b.GetPosition();
  const fud = fx.GetUserData ? fx.GetUserData() : fx.m_userData;
  return `${typeof ud === "string" ? ud : (ud && (ud.label || ud.kind || ud.id)) || "body"} @b2(${pos.x.toFixed(1)},${pos.y.toFixed(1)}) type=${fx.GetType()} sensor=${fx.IsSensor()} fud=${fud === undefined ? "-" : JSON.stringify(fud).slice(0, 60)}`;
}

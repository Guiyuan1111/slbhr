// r25c 探针 12：弹跳段接触对转储 —— 她到底踩在什么上
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
let phase = "A", sub = 0;
for (let f = 0; f <= 1300; f++) {
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
  const evs = w.step(1 / 60, { fireboy: inp, watergirl: N });
  if (f >= 1030 && f <= 1260) {
    const p = w.snapshotPlayer("fireboy");
    const b = w.chars.fireboy.body;
    // 接触边
    const touches = [];
    let ce = b.GetContactList();
    while (ce) {
      const c = ce.contact;
      if (c && c.IsTouching()) {
        const oB = ce.other;
        let fx = oB.GetFixtureList(), fis = [];
        while (fx) { fis.push(`${fx.IsSensor() ? "S" : "P"}:${fx.GetUserData() === undefined ? "-" : JSON.stringify(fx.GetUserData())}`); fx = fx.GetNext(); }
        touches.push(`${oB.GetUserData()}@(${oB.GetPosition().x.toFixed(1)},${oB.GetPosition().y.toFixed(1)})[${fis.join(",")}]`);
      }
      ce = ce.next;
    }
    const flip = f > 1030;
    console.log(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) v=(${p.vx.toFixed(1)},${p.vy.toFixed(1)}) ${p.anim} touch=[${touches.join(" | ")}]${evs && evs.length ? " EV=" + JSON.stringify(evs) : ""}`);
  }
}

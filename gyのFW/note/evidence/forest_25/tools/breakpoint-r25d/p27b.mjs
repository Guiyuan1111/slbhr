import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const w = makeWorld("forest_25");
let ph = "A", jt0 = 0;
for (let f = 0; f < 500; f++) {
  const q0 = w.snapshotPlayer("watergirl");
  const inp = f < 90 ? N : (() => {
    switch (ph) {
      case "A": if (q0.y > 200) { ph = "B"; jt0 = f; } return L;
      case "B": return f - jt0 <= 14 ? R : N;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: N, watergirl: inp });
  const q = w.snapshotPlayer("watergirl");
  if (f % 10 === 0 && ph === "B") console.log(`f${f}: (${q.x.toFixed(0)},${q.y.toFixed(0)}) v=(${q.vx.toFixed(0)},${q.vy.toFixed(0)}) ${q.anim}`);
  if (q.dead) { console.log("DEAD f", f); break; }
}

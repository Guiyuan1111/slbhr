import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const N = { up: false, left: false, right: false };
for (let f = 0; f < 6; f++) {
  const q = w.snapshotPlayer("watergirl");
  const fb = w.snapshotPlayer("fireboy");
  console.log(`f${f} wg=(${q.x.toFixed(1)},${q.y.toFixed(1)}) v=(${q.vx.toFixed(1)},${q.vy.toFixed(1)}) anim=${q.anim} | fb=(${fb.x.toFixed(1)},${fb.y.toFixed(1)})`);
  w.step(1 / 60, { fireboy: N, watergirl: N });
}

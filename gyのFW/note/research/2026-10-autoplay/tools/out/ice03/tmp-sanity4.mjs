import { makeWorld } from "../../../../../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("ice_03");
for (let f = 0; f < 80; f++) {
  const inp = { up:false, left:false, right: f >= 5 };
  w.step(1/60, { fireboy: {up:false,left:false,right:false}, watergirl: inp });
  if (f % 20 === 0) { const g = w.snapshotPlayer("watergirl"); console.log(`f=${f} wg=${g.x.toFixed(1)},${g.y.toFixed(1)}`); }
}

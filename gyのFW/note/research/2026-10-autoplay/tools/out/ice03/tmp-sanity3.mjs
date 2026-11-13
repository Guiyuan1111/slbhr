import { makeWorld, expandFlat } from "../../../../../../scripts/e2e/routetool/kernel.mjs";
const ins = expandFlat(
  [{f:5,dir:"right",type:"down"},{f:300,dir:"right",type:"up"}],
  [{f:5,dir:"left",type:"down"},{f:300,dir:"left",type:"up"}],
  320
);
const w = makeWorld("ice_03");
for (let f = 0; f < 320; f++) {
  w.step(1/60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  if (f % 50 === 0) {
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    console.log(`f=${f} fb=${fb.x.toFixed(1)},${fb.y.toFixed(1)} wg=${wg.x.toFixed(1)},${wg.y.toFixed(1)}`);
  }
}

import { makeWorld } from "../../../../../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("ice_03");
for (let f = 0; f < 90; f++) {
  w.step(1/60, { fireboy: {up:false,left:false,right:false}, watergirl: {up:false,left:true,right:false} });
  if (f % 15 === 0) {
    const wg = w.snapshotPlayer("watergirl");
    console.log(`f=${f} wg=${wg.x.toFixed(1)},${wg.y.toFixed(1)}`);
  }
}

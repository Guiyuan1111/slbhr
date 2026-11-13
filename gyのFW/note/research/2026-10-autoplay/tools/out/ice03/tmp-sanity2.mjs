import { makeWorld } from "../../../../../../scripts/e2e/routetool/kernel.mjs";
console.log("== wg right:");
let w = makeWorld("ice_03");
for (let f = 0; f < 60; f++) {
  w.step(1/60, { fireboy:{}, watergirl: {up:false,left:false,right:true} });
  if (f % 20 === 0) { const g = w.snapshotPlayer("watergirl"); console.log(`f=${f} wg=${g.x.toFixed(1)},${g.y.toFixed(1)}`); }
}
console.log("== wg up (jump):");
w = makeWorld("ice_03");
for (let f = 0; f < 40; f++) {
  w.step(1/60, { fireboy:{}, watergirl: {up:f<20,left:false,right:false} });
  if (f % 10 === 0) { const g = w.snapshotPlayer("watergirl"); console.log(`f=${f} wg=${g.x.toFixed(1)},${g.y.toFixed(1)}`); }
}
console.log("== fb right:");
w = makeWorld("ice_03");
for (let f = 0; f < 60; f++) {
  w.step(1/60, { fireboy:{up:false,left:false,right:true}, watergirl:{} });
  if (f % 20 === 0) { const g = w.snapshotPlayer("fireboy"); console.log(`f=${f} fb=${g.x.toFixed(1)},${g.y.toFixed(1)}`); }
}

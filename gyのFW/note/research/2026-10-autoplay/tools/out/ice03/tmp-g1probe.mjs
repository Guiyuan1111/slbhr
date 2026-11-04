import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const world = kernel.makeWorld("ice_03");
const step = (w, n, a, b) => { for (let f = 0; f < n; f++) w.step(1/60, { fireboy: a, watergirl: b }); };
const IN = { up:false, left:false, right:false };
const seq = [
  ...Array(3).fill(IN),
  ...Array(70).fill({ up:false, left:true, right:false }),   // walkTo -1 1075 70
  ...Array(18).fill({ up:true, left:true, right:false }),   // jd -1 18 press
  ...Array(60).fill(IN),                                     // observe
];
let f = 0;
for (const inp of seq) {
  world.step(1/60, { fireboy: IN, watergirl: inp });
  f++;
  if (f % 5 === 0) {
    const S = { players: { wg: world.snapshotPlayer("watergirl") } };

    console.log(`f${f} wg=(${S.players.wg.x.toFixed(1)},${S.players.wg.y.toFixed(1)}) g=${S.players.wg.grounded===false?0:1} vx=${S.players.wg.vx?.toFixed(0)}`);
  }
}

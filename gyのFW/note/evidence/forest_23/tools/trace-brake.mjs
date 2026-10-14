// r23b trace brake segment f238-320. usage: node --import tsx TEMP/r23b/trace-brake.mjs
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"), E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"), E(245, "right", "up"),
  E(252, "right", "down"), E(254, "right", "up"),
  E(266, "left", "down"), E(268, "left", "up"),
];
const T = 330;
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  if (f < 238) continue;
  const s = w.snapshotPlayer("fireboy");
  console.log(`f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) vx=${s.vx.toFixed(0)} vy=${s.vy.toFixed(0)}`);
}

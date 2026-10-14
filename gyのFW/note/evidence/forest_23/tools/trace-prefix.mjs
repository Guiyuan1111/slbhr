// r23b: trace v24 prefix (f3-530) anchors. usage: node --import tsx TEMP/r23b/trace-prefix.mjs
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(300, "right", "up"),
  E(335, "right", "down"), E(368, "right", "up"),
  E(378, "right", "down"),
  E(395, "up", "down"), E(425, "up", "up"),
  E(490, "right", "up"),
];
const ins = expandFlat(fb, [], 600);
const w = makeWorld("forest_23");
for (let f = 0; f < 600; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  if (s.dead || s.dying) { console.log(`DEAD f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) vx=${s.vx.toFixed(0)}`); break; }
  if (f % 10 === 0) console.log(`f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) vx=${s.vx.toFixed(0)} vy=${s.vy.toFixed(0)}`);
}

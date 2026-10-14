// r23b trace: climb from (400,556) with right, release at rDur. print f480-560.
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const rDur = Number(process.argv[2] ?? 25);
const fb = [
  E(2, "left", "down"),
  E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"),
  E(90, "up", "down"), E(130, "up", "up"),
  E(210, "left", "down"), E(230, "left", "up"),
  E(480, "right", "down"), E(480 + rDur, "right", "up"),
];
const T = 600;
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  if (f < 495) continue;
  const s = w.snapshotPlayer("fireboy");
  if (s.dead || s.dying) { console.log(`f${f} DEAD (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)})`); break; }
  console.log(`f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`);
}

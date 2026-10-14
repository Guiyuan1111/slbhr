// r23b trace: plateau walk-off path detail. usage: node --import tsx TEMP/r23b/trace-d2.mjs [s] [d]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const s = Number(process.argv[2] ?? 310), d = Number(process.argv[3] ?? 30);
const j1 = 250, rel = 285;
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(j1, "up", "down"), E(j1 + 30, "up", "up"),
  E(rel, "right", "up"),
  E(s, "left", "down"), E(s + d, "left", "up"),
];
const T = s + d + 120;
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  if (f < 280) continue;
  const sn = w.snapshotPlayer("fireboy");
  if (sn.dead || sn.dying) { console.log(`f${f} DEAD (${sn.x.toFixed(1)},${(sn.y + 35.2).toFixed(1)})`); break; }
  console.log(`f${f} (${sn.x.toFixed(1)},${(sn.y + 35.2).toFixed(1)}) vx=${sn.vx.toFixed(0)} vy=${sn.vy.toFixed(0)} ${sn.grounded ? "G" : ""}`);
}

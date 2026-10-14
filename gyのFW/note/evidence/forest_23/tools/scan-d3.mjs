// r23b scan d3: from staircase-foot brake (787,267), tap-left k frames -> vertical drop to rack(480).
// then right-walk east on rack starting at rStart, jump bump at jB, walk-off east edge, drop massif.
// usage: node --import tsx TEMP/r23b/scan-d3.mjs [ka kb]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const Ka = Number(process.argv[2] ?? 1), Kb = Number(process.argv[3] ?? 3);
for (let k = Ka; k <= Kb; k++) {
  const fb = [
    E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
    E(130, "up", "down"), E(133, "up", "up"),
    E(135, "right", "down"),
    E(196, "up", "down"), E(199, "up", "up"),
    E(245, "right", "up"),
    E(262, "left", "down"), E(262 + k, "left", "up"),
  ];
  const T = 262 + k + 130;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const sn = w.snapshotPlayer("fireboy");
    if (sn.dead || sn.dying) { out = `DEAD f${f - 262 - k}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
  }
  console.log(`tapL=${k}: ${out}`);
}

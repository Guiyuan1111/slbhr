// r23b scan d4: brake at slope foot, nudge right onto flat (788-820@268), then tap-left drop to rack.
// usage: node --import tsx TEMP/r23b/scan-d4.mjs [ka kb ma mb]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const Ka = Number(process.argv[2] ?? 1), Kb = Number(process.argv[3] ?? 3);
const Ma = Number(process.argv[4] ?? 1), Mb = Number(process.argv[5] ?? 3);
for (let k = Ka; k <= Kb; k++) {
  for (let m = Ma; m <= Mb; m++) {
    const fb = [
      E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
      E(130, "up", "down"), E(133, "up", "up"),
      E(135, "right", "down"),
      E(196, "up", "down"), E(199, "up", "up"),
      E(245, "right", "up"),
      E(252, "right", "down"), E(252 + k, "right", "up"),
      E(266, "left", "down"), E(266 + m, "left", "up"),
    ];
    const T = 266 + m + 130;
    const ins = expandFlat(fb, [], T);
    const w = makeWorld("forest_23");
    let out = "";
    for (let f = 0; f < T; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const sn = w.snapshotPlayer("fireboy");
      if (sn.dead || sn.dying) { out = `DEAD f${f - 266 - m}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
      if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
    }
    console.log(`kR=${k} mL=${m}: ${out}`);
  }
}

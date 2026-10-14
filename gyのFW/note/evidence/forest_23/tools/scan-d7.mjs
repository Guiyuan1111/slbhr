// r23b scan d7: settle at (764,289) by f303, then tap-left at tL -> walk off west edge -> drop rack west.
// usage: node --import tsx TEMP/r23b/scan-d7.mjs [tLa tLb ma mb]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const La = Number(process.argv[2] ?? 308), Lb = Number(process.argv[3] ?? 316);
const Ma = Number(process.argv[4] ?? 1), Mb = Number(process.argv[5] ?? 4);
for (let tL = La; tL <= Lb; tL += 2) {
  for (let m = Ma; m <= Mb; m++) {
    const fb = [
      E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
      E(130, "up", "down"), E(133, "up", "up"),
      E(135, "right", "down"),
      E(196, "up", "down"), E(199, "up", "up"),
      E(245, "right", "up"),
      E(tL, "left", "down"), E(tL + m, "left", "up"),
    ];
    const T = tL + m + 140;
    const ins = expandFlat(fb, [], T);
    const w = makeWorld("forest_23");
    let out = "";
    for (let f = 0; f < T; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const sn = w.snapshotPlayer("fireboy");
      if (sn.dead || sn.dying) { out = `DEAD f${f - tL - m}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
      if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
    }
    console.log(`tL=${tL} mL=${m}: ${out}`);
  }
}

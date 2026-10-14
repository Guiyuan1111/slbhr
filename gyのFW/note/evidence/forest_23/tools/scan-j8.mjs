// r23b scan j8: chute-slide -> full jump + short left -> land hub floor west of goo.
// usage: node --import tsx TEMP/r23b/scan-j8.mjs [jA jB jStep mA mB]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const JA = Number(process.argv[2] ?? 120), JB = Number(process.argv[3] ?? 240), JS = Number(process.argv[4] ?? 20);
const MA = Number(process.argv[5] ?? 0), MB = Number(process.argv[6] ?? 6);
for (let dj = JA; dj <= JB; dj += JS) {
  for (let m = MA; m <= MB; m += 3) {
    const tJ = 66 + dj;
    const fb = [
      E(3, "right", "down"), E(35, "right", "up"),
      E(50, "right", "down"), E(66, "right", "up"),
      E(tJ, "up", "down"), E(tJ + 120, "up", "up"),
      E(tJ, "left", "down"), E(tJ + Math.max(m, 1), "left", "up"),
    ];
    const T = tJ + 160;
    const ins = expandFlat(fb, [], T);
    const w = makeWorld("forest_23");
    let out = "";
    for (let f = 0; f < T; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const s = w.snapshotPlayer("fireboy");
      if (s.dead || s.dying) { out = `DEAD f${f - tJ}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
      if (f === T - 1) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`;
    }
    console.log(`tJ=66+${dj} mL=${m}: ${out}`);
  }
}

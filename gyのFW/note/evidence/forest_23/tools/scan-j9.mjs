// r23b scan j9: chute slide to end-nub (485,289), then jump+short-left -> clear goo west edge -> hub.
// usage: node --import tsx TEMP/r23b/scan-j9.mjs [jA jB jStep mA mB]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const JA = Number(process.argv[2] ?? 230), JB = Number(process.argv[3] ?? 270), JS = Number(process.argv[4] ?? 10);
const MA = Number(process.argv[5] ?? 1), MB = Number(process.argv[6] ?? 6);
for (let dj = JA; dj <= JB; dj += JS) {
  for (let m = MA; m <= MB; m += 2) {
    const tJ = 66 + dj;
    const fb = [
      E(3, "right", "down"), E(35, "right", "up"),
      E(50, "right", "down"), E(66, "right", "up"),
      E(tJ, "up", "down"), E(tJ + 30, "up", "up"),
      E(tJ, "left", "down"), E(tJ + m, "left", "up"),
    ];
    const T = tJ + 170;
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

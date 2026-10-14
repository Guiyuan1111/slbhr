// r23b scan B: from pocket rest (464,428.6) tap-left d frames -> west escape -> where settle?
// usage: node --import tsx TEMP/r23b/scan-b.mjs [tB dA dB dStep]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const tB = Number(process.argv[2] ?? 210);
const Da = Number(process.argv[3] ?? 14), Db = Number(process.argv[4] ?? 30), St = Number(process.argv[5] ?? 4);
for (let d = Da; d <= Db; d += St) {
  const fb = [
    E(2, "left", "down"),
    E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
    E(70, "right", "down"),
    E(90, "up", "down"), E(130, "up", "up"),
    E(tB, "left", "down"), E(tB + d, "left", "up"),
  ];
  const T = tB + d + 260;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const s = w.snapshotPlayer("fireboy");
    if (s.dead || s.dying) { out = `DEAD f${f - tB - d}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`;
  }
  console.log(`tB=${tB} d=${d}: ${out}`);
}

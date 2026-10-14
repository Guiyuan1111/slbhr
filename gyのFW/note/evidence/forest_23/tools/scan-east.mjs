// r23b scan: terrace exit speed. brake at 296, walk dur frames, coast off edge -> where?
// usage: node --import tsx TEMP/r23b/scan-east.mjs [dA dB step]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const Da = Number(process.argv[2] ?? 6), Db = Number(process.argv[3] ?? 20), St = Number(process.argv[4] ?? 2);
for (let d = Da; d <= Db; d += St) {
  const fb = [E(3, "right", "down"), E(35, "right", "up"), E(50, "right", "down"), E(50 + d, "right", "up")];
  const T = 50 + d + 400;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const s = w.snapshotPlayer("fireboy");
    if (s.dead || s.dying) { out = `DEAD f${f - 50 - d}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`;
  }
  console.log(`dur=${d}: ${out}`);
}

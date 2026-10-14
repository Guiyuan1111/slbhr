// r23b scan C+D: from (400,556) climb east onto hub floor, run east, fulljump -> land deck west (628,448).
// usage: node --import tsx TEMP/r23b/scan-cd.mjs [tC dA dB step]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const tC = Number(process.argv[2] ?? 500);
const Da = Number(process.argv[3] ?? 60), Db = Number(process.argv[4] ?? 110), St = Number(process.argv[5] ?? 10);
for (let d = Da; d <= Db; d += St) {
  const tD = tC + d;
  const fb = [
    E(2, "left", "down"),
    E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
    E(70, "right", "down"),
    E(90, "up", "down"), E(130, "up", "up"),
    E(210, "left", "down"), E(230, "left", "up"),       // west escape -> settle (400,556)
    E(tC, "right", "down"),                              // climb back east, run
    E(tD, "up", "down"), E(tD + 40, "up", "up"),         // full jump -> deck west
  ];
  const T = tD + 220;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const s = w.snapshotPlayer("fireboy");
    if (s.dead || s.dying) { out = `DEAD f${f - tD}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`;
  }
  console.log(`tC=${tC} tD=tC+${d}: ${out}`);
}

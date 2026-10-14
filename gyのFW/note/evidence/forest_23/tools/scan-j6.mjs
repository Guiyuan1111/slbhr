// r23b scan j6: settle (764,289) -> hold right (climb) -> full jump at tJ while holding right -> land?
// usage: node --import tsx TEMP/r23b/scan-j6.mjs [tRd jA jB jStep]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const tRd = Number(process.argv[2] ?? 310);
const jA = Number(process.argv[3] ?? 20), jB = Number(process.argv[4] ?? 60), jStep = Number(process.argv[5] ?? 5);
for (let dj = jA; dj <= jB; dj += jStep) {
  const tJ = tRd + dj;
  const fb = [
    E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
    E(130, "up", "down"), E(133, "up", "up"),
    E(135, "right", "down"),
    E(196, "up", "down"), E(199, "up", "up"),
    E(245, "right", "up"),
    E(tRd, "right", "down"),
    E(tJ, "up", "down"), E(tJ + 30, "up", "up"),
  ];
  const T = tJ + 30 + 100;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const sn = w.snapshotPlayer("fireboy");
    if (sn.dead || sn.dying) { out = `DEAD f${f - tJ}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
  }
  console.log(`tJ=tRd+${dj}: ${out}`);
}

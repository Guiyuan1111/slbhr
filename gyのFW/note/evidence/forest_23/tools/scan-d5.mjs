// r23b scan d5: settle (764,289) -> climb east to flat ledge (788-820@268) -> brake -> tap-left -> drop rack.
// usage: node --import tsx TEMP/r23b/scan-d5.mjs [tRd rA rB rStep m]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const tRd = Number(process.argv[2] ?? 310);
const rA = Number(process.argv[3] ?? 22), rB = Number(process.argv[4] ?? 42), rStep = Number(process.argv[5] ?? 5);
const m = Number(process.argv[6] ?? 2);
for (let rDur = rA; rDur <= rB; rDur += rStep) {
  const tL = tRd + rDur + 10;
  const fb = [
    E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
    E(130, "up", "down"), E(133, "up", "up"),
    E(135, "right", "down"),
    E(196, "up", "down"), E(199, "up", "up"),
    E(245, "right", "up"),
    E(tRd, "right", "down"), E(tRd + rDur, "right", "up"),
    E(tL, "left", "down"), E(tL + m, "left", "up"),
  ];
  const T = tL + m + 130;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const sn = w.snapshotPlayer("fireboy");
    if (sn.dead || sn.dying) { out = `DEAD f${f - tL - m}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
  }
  console.log(`tRd=${tRd} rDur=${rDur} mL=${m}: ${out}`);
}

// r23b scan d2b: stop at plateau edge (894,160) then nudge west to drop at low vx.
// usage: node --import tsx TEMP/r23b/scan-d2b.mjs [d1 s2 d2a d2b]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const d1 = a[0] ?? 22, S2 = a[1] ?? 340, Da = a[2] ?? 3, Db = a[3] ?? 12;
const j1 = 250, rel = 285, s1 = 310;
for (let d2 = Da; d2 <= Db; d2 += 1) {
  const fb = [
    E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
    E(130, "up", "down"), E(133, "up", "up"),
    E(135, "right", "down"),
    E(196, "up", "down"), E(199, "up", "up"),
    E(j1, "up", "down"), E(j1 + 30, "up", "up"),
    E(rel, "right", "up"),
    E(s1, "left", "down"), E(s1 + d1, "left", "up"),
    E(S2, "left", "down"), E(S2 + d2, "left", "up"),
  ];
  const T = S2 + d2 + 110;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const sn = w.snapshotPlayer("fireboy");
    if (sn.dead || sn.dying) { out = `DEAD f${f - S2 - d2}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
  }
  console.log(`d1=${d1} s2=${S2} d2=${d2}: ${out}`);
}

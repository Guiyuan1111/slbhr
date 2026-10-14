// r23b scan d2: land on 160-plateau then walk west off edge -> drop to rack.
// grid over (dropStart = left-down frame, dur = left frames), report landing pos.
// usage: node --import tsx TEMP/r23b/scan-d2.mjs [sa sb sstep da db dstep]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const Sa = a[0] ?? 300, Sb = a[1] ?? 340, Ss = a[2] ?? 8;
const Da = a[3] ?? 10, Db = a[4] ?? 50, Ds = a[5] ?? 10;
const j1 = 250, rel = 285;
for (let s = Sa; s <= Sb; s += Ss) {
  for (let d = Da; d <= Db; d += Ds) {
    const fb = [
      E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
      E(130, "up", "down"), E(133, "up", "up"),
      E(135, "right", "down"),
      E(196, "up", "down"), E(199, "up", "up"),
      E(j1, "up", "down"), E(j1 + 30, "up", "up"),
      E(rel, "right", "up"),
      E(s, "left", "down"), E(s + d, "left", "up"),
    ];
    const T = s + d + 110;
    const ins = expandFlat(fb, [], T);
    const w = makeWorld("forest_23");
    let out = "";
    for (let f = 0; f < T; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const sn = w.snapshotPlayer("fireboy");
      if (sn.dead || sn.dying) { out = `DEAD f${f - s - d}(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)})`; break; }
      if (f === T - 1) out = `(${sn.x.toFixed(0)},${(sn.y + 35.2).toFixed(0)}) vx=${sn.vx.toFixed(0)}`;
    }
    console.log(`s=${s} d=${d}: ${out}`);
  }
}

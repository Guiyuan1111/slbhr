// r23b scan: staircase-foot jump -> massif landing. grid over (j1, relR).
// prefix to brake f245 at (786,267); jump at j1 (full-hold), right released at relR (air brake).
// report position/landing at j1+120 or death.
// usage: node --import tsx TEMP/r23b/scan-j1.mjs [j1a j1b step relA relB step]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const J1a = a[0] ?? 248, J1b = a[1] ?? 272, Js = a[2] ?? 4;
const Ra = a[3] ?? 255, Rb = a[4] ?? 330, Rs = a[5] ?? 15;
for (let j1 = J1a; j1 <= J1b; j1 += Js) {
  for (let rel = Ra; rel <= Rb; rel += Rs) {
    if (rel <= j1) continue;
    const fb = [
      E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
      E(130, "up", "down"), E(133, "up", "up"),
      E(135, "right", "down"),
      E(196, "up", "down"), E(199, "up", "up"),
      E(j1, "up", "down"), E(j1 + 30, "up", "up"),
      E(rel, "right", "up"),
    ];
    const ins = expandFlat(fb, [], j1 + 140);
    const w = makeWorld("forest_23");
    let out = "";
    for (let f = 0; f < j1 + 140; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const s = w.snapshotPlayer("fireboy");
      if (s.dead || s.dying) { out = `DEAD f${f - j1}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
      // landed = near-zero vy twice in a row at scan end
      if (f === j1 + 139) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) vx=${s.vx.toFixed(0)}`;
    }
    console.log(`j1=${j1} rel=${rel}: ${out}`);
  }
}

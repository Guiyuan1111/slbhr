// r23b sweep: grid-search v14 west-jump tail params from cover plate (1181,352).
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const prefix = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(248, "up", "down"), E(278, "up", "up"),
  E(285, "right", "up"),
  E(310, "right", "down"),
  E(320, "up", "down"), E(365, "up", "up"),
  E(400, "right", "up"),
];
const results = [];
for (const lRel of [592, 595, 598, 601, 604, 607, 610, 613]) {
  for (const uRel of [605]) {
    for (let rP = 0; rP < 1; rP++) {
            const jL = 560;
      const fb = [...prefix,
                E(jL, "left", "down"), E(lRel, "left", "up"),
        E(jL, "up", "down"), E(uRel, "up", "up"),
      ];
      const ins = expandFlat(fb, [], 800);
      const w = makeWorld("forest_23");
      let out = "TIMEOUT";
      for (let f = 0; f < 800; f++) {
        w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
        const s = w.snapshotPlayer("fireboy");
        const d = w.built.doors.fireboy;
        if (s.dead || s.dying) { out = `DEAD f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
        if (d.frac >= 21) { out = `BAND f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) frac=${d.frac.toFixed(0)}`; break; }
      }
      results.push(`lRel=${lRel} uRel=${uRel} rP=${rP}: ${out}`);
      console.log(results[results.length - 1]);
    }
  }
}
console.log("---");
const bands = results.filter(r => r.includes("BAND"));
console.log(`BAND hits: ${bands.length}`);
for (const r of bands) console.log(r);

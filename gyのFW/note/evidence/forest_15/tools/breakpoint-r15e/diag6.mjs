// diag6: v41 nominal f3380-3700 wg 轨迹 + p0-p8 位置 + levers/pushers 状态
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeWorld, expandFlat } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const { fb, wg } = expandFlat(doc.fb, doc.wg, doc.totalFrames);
const w = makeWorld("forest_15");
for (let f = 0; f <= 3700; f++) {
  w.step(1 / 60, { fireboy: fb[f], watergirl: wg[f] });
  if (f >= 3380 && f % 10 === 0) {
    const s = w.mechSnapshot();
    const W = w.snapshotPlayer("watergirl");
    const P = s.platforms.map((p, i) => `p${i}@${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ");
    const L = s.levers.map((l, i) => `l${i}=${l.state}`).join(" ");
    const B = s.pushers.map((p, i) => `b${i}=${p.state}`).join(" ");
    console.log(`f${f} wg(${W.x.toFixed(1)},${W.y.toFixed(1)}) | ${P} | ${L} | ${B}`);
  }
}

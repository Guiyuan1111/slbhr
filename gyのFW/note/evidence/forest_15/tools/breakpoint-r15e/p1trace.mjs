// p1trace: p1/p0 实际位置 + l0 状态时序 (解锁 v39 尾段语义)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeWorld, expandFlat } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const total = doc.totalFrames;
const ins = expandFlat(doc.fb, doc.wg, total);
const w = makeWorld("forest_15");
const marks = new Set([4900, 4950, 5000, 5100, 5200, 5300, 5370, 5400, 5500, 6200, 6500, 6560, 6900, 6990, 7060, 7200, 7300, 7420, 7500, 7520, 7670, 7690, 7720, 7800, 7900, 7935]);
let prevL0 = -1;
for (let f = 0; f < total; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.mechSnapshot();
  if (s.levers[0].state !== prevL0) { console.log(`f${f} l0 -> s${s.levers[0].state}`); prevL0 = s.levers[0].state; }
  if (marks.has(f)) {
    const F = w.snapshotPlayer("fireboy"), W = w.snapshotPlayer("watergirl");
    console.log(`f${f} fb(${F.x.toFixed(0)},${F.y.toFixed(0)}) wg(${W.x.toFixed(0)},${W.y.toFixed(0)}) p1@${s.platforms[1].x.toFixed(1)} p0@${s.platforms[0].x.toFixed(1)} l0=s${s.levers[0].state}`);
  }
  if (w.phase === "won") { console.log("WON@" + f); break; }
}

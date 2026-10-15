// j3b: 对照 v39 名义 wg 12↑E 关节：事件表 + 逐帧轨迹
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v39 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
console.log("=== v39 wg events f4850-5300 ===");
for (const e of v39.wg) if (e.f >= 4850 && e.f <= 5300) console.log(`  #${v39.wg.indexOf(e)} f${e.f} ${e.dir} ${e.type}`);

const tr = [];
runKernel("forest_15", v39, { traceTo: tr });
console.log("=== v39 nominal wg trace f4990-5140 (every 2f) ===");
for (let f = 4990; f <= 5140; f += 2) {
  const r = tr[f];
  console.log(`  f${f} wg(${r.wg[0].toFixed(1)},${r.wg[1].toFixed(1)}) fb(${r.fb[0].toFixed(1)},${r.fb[1].toFixed(1)})`);
}

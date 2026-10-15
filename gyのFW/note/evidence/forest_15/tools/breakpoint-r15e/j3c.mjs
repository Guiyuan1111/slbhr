// j3c: v40 wg 12↑E 失败轨迹逐帧 + 头顶净空检测
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v40 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v40.json"), "utf8"));
const tr = [];
runKernel("forest_15", v40, { traceTo: tr });
console.log("=== v40 wg trace f5060-5120 (every f) ===");
for (let f = 5060; f <= 5120; f++) {
  const r = tr[f];
  console.log(`  f${f} wg(${r.wg[0].toFixed(1)},${r.wg[1].toFixed(1)})`);
}

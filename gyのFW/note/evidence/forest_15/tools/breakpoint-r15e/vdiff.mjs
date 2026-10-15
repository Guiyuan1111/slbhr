// vdiff: v39 vs v40 名义轨迹首个发散 + 关键关节状态
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const base = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const v40 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v40.json"), "utf8"));
const a = [], b = [];
runKernel("forest_15", base, { traceTo: a });
runKernel("forest_15", v40, { traceTo: b });
const M = Math.min(a.length, b.length) - 2;
let first = -1;
for (let k = 100; k < M; k++) {
  const dv = Math.max(Math.abs(a[k].fb[0] - b[k].fb[0]), Math.abs(a[k].wg[0] - b[k].wg[0]));
  const dv2 = Math.max(Math.abs(a[k + 2].fb[0] - b[k + 2].fb[0]), Math.abs(a[k + 2].wg[0] - b[k + 2].wg[0]));
  if (dv > 15 && dv2 > 15) { first = k; break; }
}
console.log("firstDiverge f" + first);
for (let k = Math.max(0, first - 60); k < Math.min(M, first + 120); k += 6) {
  console.log(`f${k} v39 fb(${a[k].fb[0].toFixed(0)},${a[k].fb[1].toFixed(0)}) wg(${a[k].wg[0].toFixed(0)},${a[k].wg[1].toFixed(0)}) | v40 fb(${b[k].fb[0].toFixed(0)},${b[k].fb[1].toFixed(0)}) wg(${b[k].wg[0].toFixed(0)},${b[k].wg[1].toFixed(0)})`);
}

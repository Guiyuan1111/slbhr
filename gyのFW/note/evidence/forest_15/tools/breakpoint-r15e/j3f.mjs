// j3f: v39 wg #59-86 完整事件表 + 名义轨迹 f5150-7936
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v39 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
console.log(`wg total events: ${v39.wg.length}`);
for (let i = 56; i < v39.wg.length; i++) {
  const e = v39.wg[i];
  console.log(`  #${i} f${e.f} ${e.dir} ${e.type}`);
}
const tr = [];
const res = runKernel("forest_15", v39, { traceTo: tr });
console.log(`v39 nominal: won=${res.won} winF=${res.winF ?? "?"}`);
for (let f = 5150; f < tr.length; f += 50) {
  const r = tr[f];
  console.log(`  f${f} wg(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)}) fb(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)})`);
}

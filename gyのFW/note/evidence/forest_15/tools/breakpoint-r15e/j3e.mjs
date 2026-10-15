// j3e: N=8 全程 wg 轨迹 + 事件流，找跳跃后的第一个失败关节
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v40 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v40.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
const N = 8;
const wg = v40.wg.map(e => ({ ...e }));
const i57 = wg.findIndex(e => e.f === 5076);
const i58 = wg.findIndex(e => e.f === 5091);
wg[i57].f = 5062 + N + 2;
wg[i58].f = 5062 + N + 17;
const doc = { ...v40, wg: sortBy(wg) };

console.log("=== wg events f5150-5700 (v40-N8 build) ===");
for (const e of doc.wg) if (e.f >= 5150 && e.f <= 5700) console.log(`  f${e.f} ${e.dir} ${e.type}`);
console.log("=== v39 wg events f5150-5700 (对照) ===");
const v39 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
for (const e of v39.wg) if (e.f >= 5150 && e.f <= 5700) console.log(`  f${e.f} ${e.dir} ${e.type}`);

const tr = [];
const res = runKernel("forest_15", doc, { traceTo: tr });
console.log(`won=${res.won} deathF=${res.deathF}`);
for (let f = 5100; f < tr.length; f += 50) {
  const r = tr[f];
  console.log(`  f${f} wg(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)}) fb(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)})`);
}
const last = tr[tr.length - 1];
console.log(`  END f${last.f} wg(${last.wg[0].toFixed(0)},${last.wg[1].toFixed(0)}) fb(${last.fb[0].toFixed(0)},${last.fb[1].toFixed(0)})`);

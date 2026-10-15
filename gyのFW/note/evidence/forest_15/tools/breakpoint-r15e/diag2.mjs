// diag2: 名义 trace 在指定帧/事件帧的位置快照 (x 整数, 1 位小数)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const frames = process.argv.slice(2).map(Number).filter(n => !isNaN(n));
const tr = [];
runKernel("forest_15", doc, { traceTo: tr });
const idx = new Map(tr.map((r, i) => [r.f, i]));
// 默认: 全部事件帧
const fs = frames.length ? frames : [...doc.fb, ...doc.wg].map(e => e.f).sort((a, b) => a - b);
for (const f of fs) {
  const i = idx.has(f) ? idx.get(f) : Math.min(tr.length - 1, f);
  const r = tr[i];
  console.log(`f${String(r.f).padStart(4)} fb(${r.fb[0].toFixed(1)},${r.fb[1].toFixed(1)}) wg(${r.wg[0].toFixed(1)},${r.wg[1].toFixed(1)})`);
}

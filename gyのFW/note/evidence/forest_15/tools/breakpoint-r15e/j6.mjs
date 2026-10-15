// j6: D-v4 探针 — s0=7385 全程按住左, 斜面基部 ~7519, 空中跳 7523
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v43 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
const wg = v43.wg.map(e => ({ ...e }));
for (const e of wg) {
  if (e.f === 7300 && e.dir === "left") { e.f = 7385; }
  if (e.f === 7431 && e.dir === "left") { e.dead = true; }
  if (e.f === 7515 && e.dir === "left") { e.dead = true; }
}
const doc = { ...v43, wg: sortBy(wg.filter(e => !e.dead)) };
const tr = [];
const res = runKernel("forest_15", doc, { traceTo: tr });
console.log(`won=${res.won} winF=${res.winF ?? "-"}`);
for (let f = 7460; f <= 7560; f += 5) {
  const r = tr[f];
  console.log(`  f${f} wg(${r.wg[0].toFixed(1)},${r.wg[1].toFixed(1)})`);
}
for (const f of [7700, 7790, 7900]) console.log(`  f${f} wg(${tr[f].wg[0].toFixed(1)},${tr[f].wg[1].toFixed(1)})`);

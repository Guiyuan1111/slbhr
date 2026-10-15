// j5: D-v2 探针 — s0=7342, release=s0+120=7462, tap 20f (#78=7503), 验证停点与落点
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v43 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
const wg = v43.wg.map(e => ({ ...e }));
for (const e of wg) {
  if (e.f === 7300 && e.dir === "left") e.f = 7342;
  if (e.f === 7431 && e.dir === "left") e.f = 7462;
  if (e.f === 7515 && e.dir === "left") e.f = 7503;
}
const tr = [];
const res = runKernel("forest_15", { ...v43, wg: sortBy(wg) }, { traceTo: tr });
console.log(`won=${res.won} winF=${res.winF ?? "-"}`);
for (const f of [7438, 7450, 7462, 7475, 7490, 7505, 7523, 7535, 7547, 7560, 7600, 7666, 7700, 7750, 7790]) {
  const r = tr[f];
  console.log(`  f${f} wg(${r.wg[0].toFixed(1)},${r.wg[1].toFixed(1)})`);
}

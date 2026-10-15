// j4: D 修正式扫参 — 西行起点 s ∈ {7330, 7360, 7390, 7420}, 观测 p1 相遇与停点
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v43 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
function build(s0) {
  const wg = v43.wg.map(e => ({ ...e }));
  for (const e of wg) {
    if (e.f === 7300 && e.dir === "left") e.f = s0;
    if (e.f === 7431 && e.dir === "left") e.f = s0 + 131;
  }
  return { ...v43, wg: sortBy(wg) };
}
for (const s0 of [7330, 7360, 7390, 7420]) {
  const tr = [];
  const res = runKernel("forest_15", build(s0), { traceTo: tr });
  const g = (f) => { const r = tr[f]; return `f${f}:(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`; };
  console.log(`s0=${s0} won=${res.won} | ${g(7420)} ${g(7450)} ${g(7480)} ${g(7510)} ${g(7523)} ${g(7550)} ${g(7580)} ${g(7700)} end wg(${tr[tr.length-1].wg[0].toFixed(0)},${tr[tr.length-1].wg[1].toFixed(0)})`);
}

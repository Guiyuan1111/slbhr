// j7: D-v5 探针 — s0=7375 hold-left, 基部跳, #83→7660
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v43 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
function build(s0, rel83) {
  const wg = v43.wg.map(e => ({ ...e }));
  for (const e of wg) {
    if (e.f === 7300 && e.dir === "left") e.f = s0;
    if (e.f === 7431 && e.dir === "left") e.dead = true;
    if (e.f === 7515 && e.dir === "left") e.dead = true;
    if (e.f === 7666 && e.dir === "left") e.f = rel83;
  }
  return { ...v43, wg: sortBy(wg.filter(e => !e.dead)) };
}
for (const s0 of [7370, 7375, 7378]) {
  const tr = [];
  const res = runKernel("forest_15", build(s0, 7660), { traceTo: tr });
  const g = (f) => { const r = tr[f]; return `${f}:(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`; };
  console.log(`s0=${s0} won=${res.won} winF=${res.winF ?? "-"} | ${g(7523)} ${g(7530)} ${g(7550)} ${g(7600)} ${g(7660)} ${g(7700)} ${g(7760)} ${g(7790)}`);
}

// j8: D-v6 探针 — s0=7375, 空中跳 7529 (深处), uu 7544, #83→7653
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v43 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
function build() {
  const wg = v43.wg.map(e => ({ ...e }));
  for (const e of wg) {
    if (e.f === 7300 && e.dir === "left") e.f = 7375;
    if (e.f === 7431 && e.dir === "left") e.dead = true;
    if (e.f === 7515 && e.dir === "left") e.dead = true;
    if (e.f === 7523 && e.dir === "up") e.f = 7529;
    if (e.f === 7538 && e.dir === "up") e.f = 7544;
    if (e.f === 7666 && e.dir === "left") e.f = 7653;
  }
  return { ...v43, wg: sortBy(wg.filter(e => !e.dead)) };
}
const tr = [];
const res = runKernel("forest_15", build(), { traceTo: tr });
const g = (f) => { const r = tr[f]; return `${f}:(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`; };
console.log(`won=${res.won} winF=${res.winF ?? "-"}`);
console.log([7514, 7521, 7526, 7529, 7535, 7541, 7547, 7553, 7560, 7653, 7700, 7760, 7790, 7900].map(g).join(" "));

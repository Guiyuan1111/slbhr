// j9: 释放帧扫描 — s0=7342, release ∈ [7461..7475], 检查墙滑/跳点/落点/门口
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v43 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
function build(rel) {
  const wg = v43.wg.map(e => ({ ...e }));
  for (const e of wg) {
    if (e.f === 7300 && e.dir === "left") e.f = 7342;
    if (e.f === 7431 && e.dir === "left") e.f = rel;
    if (e.f === 7515 && e.dir === "left") e.dead = true;   // 旧 tap 删 (left 已重新按下? 不: 7431释放后7515再按=保留!)
  }
  // 7515 left down 必须保留 (crawl 停止后重新起走=nominal tap)
  return { ...v43, wg: sortBy(wg.filter(e => !e.dead)) };
}
for (const rel of [7461, 7464, 7467, 7470, 7473]) {
  const wg2 = build(rel).wg.map(e => ({ ...e }));
  const doc = { ...v43, wg: wg2 };
  const tr = [];
  const res = runKernel("forest_15", doc, { traceTo: tr });
  const g = (f) => { const r = tr[f]; return `${f}:(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`; };
  console.log(`rel=${rel} won=${res.won} winF=${res.winF ?? "-"} | ${g(7514)} ${g(7523)} ${g(7532)} ${g(7550)} ${g(7560)} ${g(7666)} ${g(7700)} ${g(7712)} ${g(7760)} ${g(7900)}`);
}

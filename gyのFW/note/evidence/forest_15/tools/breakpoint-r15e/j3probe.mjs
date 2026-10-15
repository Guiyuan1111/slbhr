// j3probe: wg 12↑E nudge 扫描 (pin x654 → 右 N f → 跳) 基于 v40 全案
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v40 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v40.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

function build(N) {
  // wg F3 段: #55 left up 5060, right down 5062, up down 5062+N, up up 5075+N, right up 5210
  const wg = v40.wg.map(e => ({ ...e }));
  const i56 = wg.findIndex(e => e.f === 5062);
  const i57 = wg.findIndex(e => e.f === 5076);
  const i58 = wg.findIndex(e => e.f === 5091);
  wg[i57].f = 5062 + N + 2;
  wg[i58].f = 5062 + N + 17;
  return { ...v40, wg: sortBy(wg) };
}
for (const N of [0, 2, 4, 6, 8, 11, 14, 20, 28]) {
  const doc = build(N);
  const tr = [];
  const res = runKernel("forest_15", doc, { traceTo: tr });
  const last = tr[tr.length - 1];
  const takeoff = tr[5064 + N];
  let land = null;
  for (let f = 5064 + N; f < 5064 + N + 80; f++) {
    const r = tr[f];
    if (r.wg[1] >= 470 && r.wg[1] <= 480 && r.wg[0] > 700) { land = `f${f}(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`; break; }
  }
  console.log(`N=${N} won=${res.won ? "WIN@" + res.winF : "FAIL"} takeoff(${takeoff.wg[0].toFixed(1)},${takeoff.wg[1].toFixed(1)}) land=${land} end wg(${last.wg[0].toFixed(0)},${last.wg[1].toFixed(0)})`);
}

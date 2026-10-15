// j2probe2: F2 跳参数扫 (Design D: pin→走R f→停→3f助跑跳+空中右舵) + b2 释 f3767
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const base = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

function build(X, R) {
  const fb = sortBy([
    ...base.fb.slice(0, 18).map(e => ({ ...e })),
    { f: 3520, dir: "right", type: "down" }, { f: 3590, dir: "right", type: "up" },
    { f: 3594, dir: "left", type: "down" }, { f: X - 8, dir: "left", type: "up" },
    { f: X, dir: "up", type: "down" }, { f: X + 15, dir: "up", type: "up" },
    { f: X + 2, dir: "left", type: "down" }, { f: 3767, dir: "left", type: "up" },
    { f: 4200, dir: "left", type: "down" }, { f: 4420, dir: "left", type: "up" },
    { f: 4560, dir: "right", type: "down" }, { f: 4560 + R, dir: "right", type: "up" },
    { f: 4592 + R, dir: "right", type: "down" }, { f: 4595 + R, dir: "up", type: "down" }, { f: 4610 + R, dir: "up", type: "up" },
    { f: 4680 + R, dir: "right", type: "up" },
    { f: 4870, dir: "left", type: "down" }, { f: 4873, dir: "up", type: "down" }, { f: 4888, dir: "up", type: "up" },
    ...base.fb.slice(39).map(e => ({ ...e })),
  ]);
  return { ...base, fb, wg: base.wg };
}
for (const [X, R] of [[3630, 24], [3630, 28], [3630, 32], [3630, 36], [3636, 28], [3636, 32], [3636, 36]]) {
  const doc = build(X, R);
  const tr = [];
  const res = runKernel("forest_15", doc, { traceTo: tr });
  const last = tr[tr.length - 1];
  let b2 = null;
  for (let f = 3850; f < 4200; f++) { const r = tr[f]; if (r.fb[0] > 495 && r.fb[0] < 595 && Math.abs(r.fb[1] - 604) < 3) { b2 = r.fb[0].toFixed(0); break; } }
  console.log(`X=${X} R=${R} won=${res.won ? "WIN@" + res.winF : "FAIL"} end fb(${last.fb[0].toFixed(0)},${last.fb[1].toFixed(0)}) wg(${last.wg[0].toFixed(0)},${last.wg[1].toFixed(0)}) b2stop=${b2}`);
}

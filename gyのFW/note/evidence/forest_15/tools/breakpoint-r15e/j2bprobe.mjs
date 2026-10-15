// j2bprobe: fb 东墙pin→西走→停→立定跳 参数扫描 (Design B: 左 up X, left down X+2)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const base = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
// fb 新尾段 (F2b 变体 X + 后续 F2)
function build(X) {
  const fb = sortBy([
    ...base.fb.slice(0, 18).map(e => ({ ...e })),
    { f: 3520, dir: "right", type: "down" }, { f: 3590, dir: "right", type: "up" },
    { f: 3594, dir: "left", type: "down" }, { f: X - 8, dir: "left", type: "up" },
    { f: X, dir: "up", type: "down" }, { f: X + 15, dir: "up", type: "up" },
    { f: X + 2, dir: "left", type: "down" }, { f: 3745, dir: "left", type: "up" },
    // b2 段: 落地后西行走停带 (起点实测后调; 先按 nominal f3745+100)
    { f: 3745, dir: "left", type: "down" }, { f: 3845, dir: "left", type: "up" },
    { f: 4200, dir: "left", type: "down" }, { f: 4420, dir: "left", type: "up" },
    { f: 4560, dir: "right", type: "down" }, { f: 4580, dir: "up", type: "down" }, { f: 4595, dir: "up", type: "up" },
    { f: 4860, dir: "right", type: "up" },
    { f: 4870, dir: "left", type: "down" }, { f: 4873, dir: "up", type: "down" }, { f: 4888, dir: "up", type: "up" },
    ...base.fb.slice(39).map(e => ({ ...e })),
  ]);
  function sortBy(arr) { return [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1)); }
  return { ...base, fb, wg: base.wg };
}
for (const X of [3612, 3618, 3624, 3630, 3636]) {
  const doc = build(X);
  const tr = [];
  const res = runKernel("forest_15", doc, { traceTo: tr });
  // 起跳位/落地
  let land = null, stop = null;
  for (let f = X; f < X + 160; f++) {
    const r = tr[f];
    if (r.fb[1] >= 604 && r.fb[1] <= 606 && r.fb[0] < 1100 && !land) land = `f${f}(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)})`;
  }
  for (let f = 3800; f < 4200; f++) {
    const r = tr[f];
    if (r.fb[0] > 490 && r.fb[0] < 600 && r.fb[1] < 620) { stop = `f${f}:${r.fb[0].toFixed(0)}`; break; }
  }
  const takeoff = tr[X];
  console.log(`X=${X} won=${res.won ? "WIN@" + res.winF : res.deathF >= 0 ? "DEATH@" + res.deathF : "TIMEOUT"} takeoff(${takeoff.fb[0].toFixed(0)},${takeoff.fb[1].toFixed(0)}) land=${land} b2stop=${stop}`);
}

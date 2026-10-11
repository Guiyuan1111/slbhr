// s20.mjs — 03_1 Ground 层逐行 run 解码（精确列区间）
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync("data/forest/levels/forest_03_1.json", "utf8"));
const L = d.layers.find((l) => l.name === "Ground");
const W = d.width;
const NAME = { 1: "solid", 2: "ramp/", 3: "ramp\\", 4: "halfL", 5: "halfR", 6: "water", 7: "lava", 8: "t8", 9: "t9" };
for (let r = 0; r < d.height; r++) {
  const runs = [];
  let cur = null;
  for (let c = 0; c < W; c++) {
    const v = L.data[r * W + c];
    if (v === 0) { cur = null; continue; }
    if (!cur || cur.v !== v) { cur = { v, c0: c, c1: c }; runs.push(cur); }
    else cur.c1 = c;
  }
  if (runs.length) console.log("r" + String(r).padStart(2), runs.map((x) => `${NAME[x.v] || x.v} c${x.c0}-${x.c1}(${x.c0 * 32}-${(x.c1 + 1) * 32})`).join("  "));
}

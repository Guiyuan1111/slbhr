// 基线路线全事件 ±1f 致命扫描（直接 runKernel, 无 optimize 的群动干扰）
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
import { readFileSync } from "node:fs";
const path = process.argv[2] || "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW/scripts/e2e/inputs/routes/forest_04.json";
const route = JSON.parse(readFileSync(path, "utf8"));
let fatal = 0, denom = 0;
const base = runKernel(route.level, route, {});
console.log(`base: won=${base.won} winF=${base.winF ?? "-"}`);
for (const side of ["fb", "wg"]) {
  for (let i = 0; i < route[side].length; i++) {
    for (const d of [1, -1]) {
      const doc = { level: route.level, totalFrames: route.totalFrames, fb: route.fb.map(e => ({ ...e })), wg: route.wg.map(e => ({ ...e })) };
      doc[side][i].f += d;
      const r = runKernel(route.level, doc, {});
      denom++;
      if (!r.won) { fatal++; console.log(`${side.toUpperCase()}#${i} f${route[side][i].f}${d > 0 ? "+1" : "-1"} (${route[side][i].dir} ${route[side][i].type}) → won=${r.won} deathF=${r.deathF}`); }
    }
  }
}
console.log(`fatal ${fatal}/${denom}`);

// fatmap: 逐事件 ±1f 致命扫描 → 刀口地图
import { runKernel } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const doc = JSON.parse(readFileSync(new URL("../../../../../scripts/e2e/inputs/routes/forest_05.json", import.meta.url), "utf8"));
const run = (fb, wg) => runKernel("forest_05", { ...doc, fb, wg }, {});
const j = (arr, i, d) => arr.map((e, k) => k === i ? { ...e, f: e.f + d } : e).sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
const map = [];
for (const who of ["fb", "wg"]) {
  for (let i = 0; i < doc[who].length; i++) {
    const res = [];
    for (const d of [1, -1]) {
      const r = run(who === "fb" ? j(doc.fb, i, d) : doc.fb, who === "wg" ? j(doc.wg, i, d) : doc.wg);
      res.push(r.won ? 0 : 1);
    }
    map.push({ who, i, f: doc[who][i].f, dir: doc[who][i].dir, typ: doc[who][i].type, plus: res[0], minus: res[1] });
    process.stdout.write(`${who}${i}(${doc[who][i].f}${doc[who][i].dir[0]}${doc[who][i].type[0]})${res[0] ? "+" : "-"}${res[1] ? "+" : "-"} `);
  }
}
writeFileSync(new URL("./fatmap.json", import.meta.url), JSON.stringify(map));
console.log("\nfatal+:", map.filter(m => m.plus).length, "fatal-:", map.filter(m => m.minus).length, "of", map.length);

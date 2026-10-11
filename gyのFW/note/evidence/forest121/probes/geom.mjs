// forest_12_1 精确几何：逐行 run 长度 + 关卡解析对象（只读诊断）
import { join } from "node:path";
import { readFileSync } from "node:fs";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { parseLevel } = await import("file://" + join(ROOT, "packages/shared/src/level2.ts").replace(/\\/g, "/"));
const { makeProvider, locateLevel } = await import("file://" + join(ROOT, "scripts/e2e/routetool/kernel.mjs").replace(/\\/g, "/"));
const { dir, doc } = locateLevel("forest_12_1");
const L = parseLevel("forest_12_1", doc, makeProvider(dir));
const TN = ["#", "/", "\\", "C", "D", "W", "L", "G"];
const { cols, rows, groundType } = L;
console.log(`cols=${cols} rows=${rows} spawnFB=(${L.spawnFireboy?.x},${L.spawnFireboy?.y}) spawnWG=(${L.spawnWatergirl?.x},${L.spawnWatergirl?.y})`);
for (let r = 0; r < rows; r++) {
  const runs = [];
  let s = 0;
  for (let c = 1; c <= cols; c++) {
    if (c === cols || groundType[r * cols + c] !== groundType[r * cols + s]) {
      const t = groundType[r * cols + s];
      if (t !== -99) runs.push(`${TN[t] ?? t}:${s}-${c - 1}`);
      s = c;
    }
  }
  if (runs.length) console.log(`row${String(r).padStart(2)} y=${String(32 * r).padStart(3)}-${32 * r + 31}: ${runs.join(" ")}`);
}
console.log("\ndoors:", JSON.stringify(L.doors));
console.log("diamonds:", L.diamonds.map(d => `${d.kind}(${d.x},${d.y})`).join(" "));
console.log("hangings:", JSON.stringify(L.hangings));
console.log("liquids:", JSON.stringify(L.liquids));

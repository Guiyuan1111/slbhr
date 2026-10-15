// 从 dump-out.txt 提取 45° 斜面/楔三角形并分类（flashbp17）
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(join(HERE, "dump-out.txt"), "utf8").split("\n");
const out = [];
for (const ln of lines) {
  const m = ln.match(/^b25 ud=ground dyn=0: (.+)$/);
  if (!m) continue;
  const pts = [...m[1].matchAll(/\((-?[\d.]+),(-?[\d.]+)\)/g)].map((x) => [+x[1], +x[2]]).filter((p) => !(p[0] === 0 && p[1] === 0));
  if (pts.length === 3) out.push(pts);
}
for (const pts of out) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const has = (a, b) => pts.some((p) => Math.abs(p[0] - a) < 0.5 && Math.abs(p[1] - b) < 0.5);
  const kind = has(x1, y0) ? "/" : "\\";
  console.log(`${kind} face (${x0},${y0})->(${x1},${y1})  w=${x1 - x0} tri=${pts.map((p) => `(${p[0]},${p[1]})`).join("")}`);
}
console.log("total triangles:", out.length);

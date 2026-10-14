// bbox.mjs — 解析 geo-full.txt 的 poly 行，输出 bbox 与窗口过滤
// 用法: node bbox.mjs <x1> <y1> <x2> <y2>
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const [X1, Y1, X2, Y2] = process.argv.slice(2).map(Number);
const lines = readFileSync(join(here, "geo-full.txt"), "utf8").split(/\r?\n/);
let body = "?";
for (const ln of lines) {
  const bm = ln.match(/^(b\d+) /);
  if (bm) body = bm[1];
  const m = ln.match(/poly: (.*)$/);
  if (!m) continue;
  const pts = [...m[1].matchAll(/\((-?[0-9.]+),(-?[0-9.]+)\)/g)].map((p) => [+p[1], +p[2]]);
  if (!pts.length) continue;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx1 = Math.min(...xs), bx2 = Math.max(...xs), by1 = Math.min(...ys), by2 = Math.max(...ys);
  if (bx2 >= X1 && bx1 <= X2 && by2 >= Y1 && by1 <= Y2) {
    const surf = pts.slice(0, Math.min(4, pts.length)).map((p) => `(${p[0]},${p[1]})`).join(" ");
    console.log(`${body} bbox[x${bx1}-${bx2} y${by1}-${by2}] ${ln.includes("sens=true") ? "SENSOR" : ""} ${surf}`);
  }
}

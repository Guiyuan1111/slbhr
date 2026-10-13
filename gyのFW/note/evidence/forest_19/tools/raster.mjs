// r19c raster2：解析 geo.out 全多边形，凸包填充光栅化 ASCII 图（4px/格）
// node --import tsx TEMP/r19c/raster2.mjs <x0> <x1> <y0> <y1> [step]
import { readFileSync } from "node:fs";
const lines = readFileSync("TEMP/r19a/geo.out", "utf8").split("\n");
const polys = [];
for (const ln of lines) {
  const m = ln.match(/poly: (.*)/);
  if (!m) continue;
  const pts = [...m[1].matchAll(/\((-?\d+),(-?\d+)\)/g)].map(p => ({ x: +p[1], y: +p[2] })).filter(p => !(p.x === 0 && p.y === 0));
  if (pts.length >= 3) polys.push(pts);
}
const [X0, X1, Y0, Y1] = process.argv.slice(2, 6).map(Number);
const ST = Number(process.argv[6] ?? 4);
const inPoly = (px, py, P) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if (((P[i].y > py) !== (P[j].y > py)) && (px < ((P[j].x - P[i].x) * (py - P[i].y)) / (P[j].y - P[i].y) + P[i].x)) c = !c;
  }
  return c;
};
let head = "    ";
for (let x = X0; x < X1; x += ST * 5) head += String(x).padEnd(5 * ST / ST + 4, " ");
console.log(head);
for (let y = Y0; y < Y1; y += ST) {
  let row = String(y).padStart(4) + " ";
  for (let x = X0; x < X1; x += ST) {
    let solid = false;
    for (const P of polys) if (inPoly(x, y, P)) { solid = true; break; }
    row += solid ? "#" : ".";
  }
  console.log(row);
}

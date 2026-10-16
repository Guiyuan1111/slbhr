// 解析 geo.out 静态 ground 体 → ASCII 全图（32px 栅格）
import { readFileSync } from "node:fs";
const D = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/forest_05/tools/breakpoint-r05f/geo.out";
const lines = readFileSync(D, "utf8").split("\n");
const blocks = [];
for (const ln of lines) {
  if (!ln.includes("ud=ground")) continue;
  const pts = [...ln.matchAll(/\((\-?\d+),(\-?\d+)\)/g)].map(m => [+m[1], +m[2]]);
  if (pts.length < 4) continue;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 > 1200 || y1 - y0 > 1200) continue;
  blocks.push({ x0, x1, y0, y1 });
}
// 栅格：x 每 32px 一列（0..36），y 每 32px 一行（0..30）
const COLS = 37, ROWS = 31;
const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("."));
for (const b of blocks) {
  for (let cy = Math.floor(b.y0 / 32); cy < Math.ceil(b.y1 / 32) && cy < ROWS; cy++)
    for (let cx = Math.floor(b.x0 / 32); cx < Math.ceil(b.x1 / 32) && cx < COLS; cx++)
      grid[cy][cx] = "#";
}
// 叠加动态体/门/出生点标记（来自 geo.out 其余条目）
for (const ln of lines) {
  const mP = ln.match(/P(\d) .*: \((\d+),(\d+)\) \((\d+),(\d+)\)/);
  if (mP) {
    const [, id, x0, y0, x1, y1] = mP.map(Number);
    const cx = Math.round((x0 + x1) / 64), cy = Math.round((y0 + y1) / 64);
    if (cy < ROWS && cx < COLS) grid[cy][cx] = id;
  }
  const mD = ln.match(/door.*\((\d+),(\d+)\)/i);
  if (mD) { const cx = Math.round(+mD[1] / 64), cy = Math.round(+mD[2] / 64); grid[cy]?.[cx] !== undefined && (grid[cy][cx] = "D"); }
  const mG = ln.match(/gem.*\((\d+),(\d+)\)/i) || ln.match(/diamond.*\((\d+),(\d+)\)/i);
  if (mG) { const cx = Math.round(+mG[1] / 64), cy = Math.round(+mG[2] / 64); if (grid[cy]?.[cx] === ".") grid[cy][cx] = "g"; }
}
console.log("x: 0    160  320  480  640  800  960 1120");
console.log("    0    5    10   15   20   25   30   35  (col=32px, row=32px, y0=0)");
for (let r = 0; r < ROWS; r++) console.log(String(r * 32).padStart(4) + " " + grid[r].join(""));
console.log("\nblocks total:", blocks.length);
const hi = blocks.filter(b => b.y0 >= 96 && b.y1 <= 640);
console.log("mid blocks (y 96-640):"); for (const b of hi) console.log(`  [${b.x0},${b.x1}]x[${b.y0},${b.y1}]`);

console.log("\nlargest blocks:");
for (const b of [...blocks].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0)).slice(0, 8))
  console.log(`  [${b.x0},${b.x1}]x[${b.y0},${b.y1}]  w=${b.x1 - b.x0} h=${b.y1 - b.y0}`);

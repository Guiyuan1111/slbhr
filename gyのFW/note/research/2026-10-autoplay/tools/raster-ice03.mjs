// raster-ice03.mjs — 内核 groundBody fixture 栅格化（fw-route-ice03 槽）。
// 把全部静态地形 fixture（含液体端盖/斜面/楔）按 8px 栅格画成字符图，权威地形底稿。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;

const w = makeWorld("ice_03");
const ground = w.level && null;
// 取 groundBody：world 私有，经 built 不暴露——改用碰撞法：对每个 8px 采样点做 ray/查询太慢。
// 直接用 level.groundType + SHAPE_PTS 语义自绘（与 build.ts 同式），另加水 runs。
const GROUND_TYPE = (await import(pathToFileURL(join(ROOT, "packages/shared/src/level2.ts")).href)).GROUND_TYPE;
const lvl = w.level;
const RES = 8; // px per cell
const W = Math.ceil(1248 / RES), H = Math.ceil(928 / RES);
const grid = Array.from({ length: H }, () => Array(W).fill(" "));
const mark = (x0, y0, x1, y1, ch) => {
  for (let gy = Math.floor(y0 / RES); gy < Math.ceil(y1 / RES); gy++)
    for (let gx = Math.floor(x0 / RES); gx < Math.ceil(x1 / RES); gx++)
      if (gy >= 0 && gy < H && gx >= 0 && gx < W) grid[gy][gx] = ch;
};
const slopeMark = (pts, ch) => {
  // 多边形填充（scanline）
  const ys = pts.map((p) => p[1]);
  const ymin = Math.floor(Math.min(...ys) / RES) * RES, ymax = Math.ceil(Math.max(...ys) / RES) * RES;
  for (let y = ymin; y < ymax; y += RES / 2) {
    const xc = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xc.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xc.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xc.length; k += 2) mark(xc[k], y, xc[k + 1], y + RES / 2, ch);
  }
};
for (let r = 0; r < lvl.rows; r++) {
  for (let c = 0; c < lvl.cols; c++) {
    const t = lvl.groundType[r * lvl.cols + c];
    if (t === -99) continue;
    const X = c * 32, Y = r * 32;
    const tri = (loc) => slopeMark(loc.map(([px, py]) => [X - px * 32, Y - py * 32]), "#");
    if (t === GROUND_TYPE.SOLID || t === 10) mark(X, Y, X + 32, Y + 32, "#");
    else if (t === GROUND_TYPE.SLOPE_A || t === 11) tri([[-1, 0], [-1, -1], [0, -1]]); // '/'
    else if (t === GROUND_TYPE.SLOPE_B || t === 12) tri([[0, 0], [-1, -1], [0, -1]]); // '\'
    else if (t === GROUND_TYPE.WEDGE_C) tri([[0, 0], [-1, 0], [-1, -1]]); // c
    else if (t === GROUND_TYPE.WEDGE_D) tri([[0, 0], [-1, 0], [0, -1]]); // d
    else if (t === GROUND_TYPE.WATER || t === 55) mark(X, Y, X + 32, Y + 32, "~");
    else if (t === GROUND_TYPE.LAVA) mark(X, Y, X + 32, Y + 32, "!");
    else if (t === GROUND_TYPE.GREEN) mark(X, Y, X + 32, Y + 32, "$");
  }
}
// 液体端盖（buildLiquid）：左盖 pts (0,0)(-1.3,-0.5)(-1.3,-1)(0,-1) 平移 (col0,row)；右盖 (0.3,-0.5)(-1,0)(-1,-1)(0.3,-1)
for (const run of lvl.liquidRuns ?? []) {
  const X = run.col0 * 32, Y = run.row * 32;
  slopeMark([[X, Y], [X - 1.3 * 32, Y + 0.5 * 32], [X - 1.3 * 32, Y + 32], [X, Y + 32]], "#");
  const X2 = (run.col1 + 1) * 32;
  slopeMark([[X2 + 0.3 * 32, Y + 0.5 * 32], [X2 - 32, Y + 32], [X2 - 32, Y + 32], [X2 + 0.3 * 32, Y + 32]], "#");
}
// 机关叠加：beamer/mirror/slider/timedpusher
const M = w.mechSnapshot();
for (const s of M.sliders) mark(s.x - 10, s.y - 10, s.x + 10, s.y + 10, "S");
for (const t of M.timedPushers) mark(t.x - 16, t.y - 16, t.x + 16, t.y + 16, "T");
// spawn/doors
const sp = lvl.spawn;
mark(sp.fireboy.x - 14, sp.fireboy.y - 22, sp.fireboy.x + 14, sp.fireboy.y + 18, "F");
mark(sp.watergirl.x - 14, sp.watergirl.y - 22, sp.watergirl.x + 14, sp.watergirl.y + 18, "W");
const dr = lvl.doors;
mark(dr.watergirl.x, dr.watergirl.y, dr.watergirl.x + dr.watergirl.w, dr.watergirl.y + dr.watergirl.h, "w");
mark(dr.fireboy.x, dr.fireboy.y, dr.fireboy.x + dr.fireboy.w, dr.fireboy.y + dr.fireboy.h, "f");
for (const d of w.diamonds ?? []) mark(d.x - 11, d.y - 11, d.x + 11, d.y + 11, "*");

console.log("   " + Array.from({ length: W }, (_, i) => (i % 10 === 0 ? String((i * RES) / 100 % 10) : " ")).join(""));
console.log("   " + Array.from({ length: W }, (_, i) => (i % 2 === 0 ? String(((i * RES) % 100) / 10) : " ")).join(""));
for (let gy = 0; gy < H; gy++) console.log(String(gy * RES).padStart(3) + " " + grid[gy].join(""));

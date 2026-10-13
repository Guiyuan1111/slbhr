// flashbp22 part2: 关键竖直/水平剖面 + 风柱遮挡分析（复用 decode22 的固定件构建）
import { readFileSync } from "node:fs";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const json = JSON.parse(readFileSync(`${ROOT}/data/forest/levels/forest_22.json`, "utf8"));
const groundTs = JSON.parse(readFileSync(`${ROOT}/assets/tilemaps/tilesets/Ground.json`, "utf8"));
const COLS = json.width, ROWS = json.height, T = 32;
const gFirst = 1;
const data = json.layers.find((l) => l.name === "Ground").data;
const typeAt = new Int16Array(COLS * ROWS).fill(-99);
for (let i = 0; i < COLS * ROWS; i++) {
  const gid = data[i] | 0;
  if (!gid) continue;
  let t = Number(groundTs.tileproperties[String(gid - gFirst)]?.type ?? 0);
  if (t === 11) t = 1; if (t === 12) t = 2;
  typeAt[i] = t;
}
const at = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? -99 : typeAt[r * COLS + c]);
const fixtures = [];
for (let r = 0; r < ROWS; r++) {
  let runA = 0, runV = 0;
  for (let c = 0; c <= COLS; c++) {
    const t = c < COLS ? at(c, r) : -99;
    if (t === 0) {
      if (runA === 0) { runV = c; runA = 1; } else runA++;
      const right = c + 1 < COLS ? at(c + 1, r) : -99;
      if (right === 0) continue;
      fixtures.push({ kind: "solid", pts: [[runV * T, r * T], [(runV + runA) * T, r * T], [(runV + runA) * T, (r + 1) * T], [runV * T, (r + 1) * T]] });
      runA = 0;
    } else if (t >= 1 && t <= 4) {
      const L = c * T, R = L + T, Tp = r * T, B = Tp + T;
      const pts = t === 1 ? [[R, Tp], [R, B], [L, B]] : t === 2 ? [[L, Tp], [R, B], [L, B]] : t === 3 ? [[L, Tp], [R, Tp], [R, B]] : [[L, Tp], [R, Tp], [L, B]];
      fixtures.push({ kind: ["", "/", "\\", "r", "l"][t], pts });
    }
  }
}
function inPoly(px, py, pts) {
  let s = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) s = !s;
  }
  return s;
}
function solidAt(px, py) { for (const f of fixtures) if (inPoly(px, py, f.pts)) return f; return null; }
function vprof(x) {
  const out = [];
  for (let y = 0; y < ROWS * T; y += 1) {
    const f = solidAt(x, y);
    if (f && (!out.length || out[out.length - 1].y1 < y - 1)) out.push({ y0: y, y1: y });
    else if (f) out[out.length - 1].y1 = y;
  }
  return out.map((s) => `${s.y0}-${s.y1 + 1}`).join(" ");
}
function hprof(y) {
  const out = [];
  for (let x = 0; x < COLS * T; x += 1) {
    const f = solidAt(x, y);
    if (f && (!out.length || out[out.length - 1].x1 < x - 1)) out.push({ x0: x, x1: x });
    else if (f) out[out.length - 1].x1 = x;
  }
  return out.map((s) => `${s.x0}-${s.x1 + 1}`).join(" ");
}
console.log("== 竖直剖面 solid 区间 (x: y0-y1 …), 全高 0-928 ==");
for (const x of [48, 80, 128, 176, 208, 240, 288, 352, 400, 496, 544, 576, 624, 656, 704, 784, 816, 848, 912, 944, 960, 1000, 1040, 1090, 1120, 1168, 1200]) {
  console.log(`  x=${String(x).padStart(4)}: ${vprof(x)}`);
}
console.log("\n== 水平剖面 solid 区间 (y: x0-x1 …), 全宽 0-1248 ==");
for (const y of [48, 80, 112, 144, 176, 208, 240, 272, 304, 336, 368, 400, 432, 464, 496, 528, 560, 592, 624, 656, 688, 720, 752, 784, 816, 848, 880, 910]) {
  console.log(`  y=${String(y).padStart(4)}: ${hprof(y)}`);
}
console.log("\n== 风柱遮挡：风柱矩形与 solid 固定件求交（传感器 2.6m 宽, 0.5..0.5+len 高）==");
function windBodyPos(rect, rotation) {
  const rotDeg = rotation + 90, eAng = (-rotDeg * Math.PI) / 180;
  return { x: rect.x + (-48 * Math.cos(eAng) - 32 * Math.sin(eAng)), y: rect.y + rect.h - (-48 * Math.sin(eAng) + 32 * Math.cos(eAng)) };
}
for (const o of json.layers.find((l) => l.name === "Objects").objects) {
  if (o.gid !== 26) continue;
  const rect = { x: o.x, y: o.y - o.height, w: o.width, h: o.height };
  const bp = windBodyPos(rect, o.rotation);
  const len = o.properties.length ?? 10;
  const x0 = bp.x - 41.6, x1 = bp.x + 41.6, y1 = bp.y - 16, y0 = bp.y - (0.5 + len) * 32;
  const hits = [];
  for (const f of fixtures) {
    const fx0 = Math.min(...f.pts.map((p) => p[0])), fx1 = Math.max(...f.pts.map((p) => p[0]));
    const fy0 = Math.min(...f.pts.map((p) => p[1])), fy1 = Math.max(...f.pts.map((p) => p[1]));
    if (fx0 < x1 && fx1 > x0 && fy0 < y1 && fy1 > y0) hits.push(`[${f.kind} ${fx0}-${fx1}x${fy0}-${fy1}]`);
  }
  console.log(`  fan obj${o.id} len${len} 柱 x${x0.toFixed(1)}-${x1.toFixed(1)} y${y0}-${y1}: ${hits.length ? hits.join(" ") : "无遮挡"}`);
}
console.log("\n== 门/出生点剖面 ==");
console.log("  fb 门铰 (96,672) 上方竖剖 x=96:", vprof(96));
console.log("  wg 门铰 (80,160) 上方竖剖 x=80:", vprof(80));
console.log("  fb 出生 (352,672) 竖剖 x=352:", vprof(352));
console.log("  wg 出生 (128,160) 竖剖 x=128:", vprof(128));

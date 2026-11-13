// surf-ice03.mjs — 精确可站立表面提取（fw-route-ice03 槽）。
// 从 lvl.groundType 重建与 build.ts 同式的多边形，1px 精度栅格化后提取：
//  - 全部「顶面朝上」表面段（x 区间、左右端 y、坡向）
//  - 可站立过滤：角色盒(±15px 宽, 高 57px)头部落点无实心重叠
//  - 液体参数：表面 y、冰条带、传感条带、底床顶
//  - 机关几何：滑轨/冰镜/投射器
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const l2 = await import(pathToFileURL(join(ROOT, "packages/shared/src/level2.ts")).href);
const GROUND_TYPE = l2.GROUND_TYPE;

const w = makeWorldSafe();
function makeWorldSafe() {
  // makeWorld 需要角色构造，直接调用
  return kernel.makeWorld("ice_03");
}
const lvl = w.level;

// ── 1px 栅格 ──
const W = 1248, H = 928;
const solid = new Uint8Array(W * H);
const water = new Uint8Array(W * H);
const fill = (pts, arr) => {
  // 扫描线填充（pts 屏幕坐标）
  const ymin = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
  const ymax = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1]))));
  for (let y = ymin; y < ymax; y++) {
    const xc = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xc.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xc.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xc.length; k += 2) {
      const x0 = Math.max(0, Math.round(xc[k])), x1 = Math.min(W, Math.round(xc[k + 1]));
      for (let x = x0; x < x1; x++) arr[y * W + x] = 1;
    }
  }
};
for (let r = 0; r < lvl.rows; r++) {
  for (let c = 0; c < lvl.cols; c++) {
    const t = lvl.groundType[r * lvl.cols + c];
    const X = c * 32, Y = r * 32;
    const tri = (loc) => fill(loc.map(([px, py]) => [X - px * 32, Y - py * 32]), solid);
    if (t === GROUND_TYPE.SOLID || t === 10) fill([[X, Y], [X + 32, Y], [X + 32, Y + 32], [X, Y + 32]], solid);
    else if (t === GROUND_TYPE.SLOPE_A || t === 11) tri([[-1, 0], [-1, -1], [0, -1]]);
    else if (t === GROUND_TYPE.SLOPE_B || t === 12) tri([[0, 0], [-1, -1], [0, -1]]);
    else if (t === GROUND_TYPE.WEDGE_C) tri([[0, 0], [-1, 0], [-1, -1]]);
    else if (t === GROUND_TYPE.WEDGE_D) tri([[0, 0], [-1, 0], [0, -1]]);
    else if (t === GROUND_TYPE.WATER || t === 55) fill([[X, Y], [X + 32, Y], [X + 32, Y + 32], [X, Y + 32]], water);
  }
}
// 液体端盖（build.ts buildLiquid 语义）：西盖锚 (col0,row) pts (0,0)(-1.3,-0.5)(-1.3,-1)(0,-1)
// screen = (C - px*32, R - py*32)
const caps = [];
for (const run of lvl.liquidRuns ?? []) caps.push(run);
const runs = caps.length ? caps : (lvl.liquids ?? []);
console.log("== liquidRuns ==", JSON.stringify(runs));
for (const run of runs) {
  const C0 = run.col0 * 32, R = run.row * 32, C1 = (run.col1 + 1) * 32;
  fill([[C0, R], [C0 + 1.3 * 32, R + 0.5 * 32], [C0 + 1.3 * 32, R + 32], [C0, R + 32]], solid);
  fill([[C1 - 0.3 * 32, R + 0.5 * 32], [C1 - 32, R + 32], [C1 - 32, R + 16], [C1 - 0.3 * 32, R + 32]], solid);
}
const isSolid = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? 1 : solid[y * W + x];
const isWater = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? 0 : water[y * W + x];

// ── 表面段提取：对每个 x 找 y 使 solid[y][x] && !solid[y-1][x]，向量化 ──
const topAt = []; // per x: array of y
for (let x = 0; x < W; x++) {
  const ys = [];
  for (let y = 1; y < H; y++) if (solid[y * W + x] && !solid[(y - 1) * W + x]) ys.push(y);
  topAt.push(ys);
}
// 连通成段：同段内相邻 x 的 y 差 ≤ 1（45°=每 x 差 1 ✓），且 x 连续。
// 多轨道：每个 y 匹配任一未在本 x 扩展过的开放段（修同 x 多高度断链 bug）。
const segs = [];
const used = new Set(); // seg indices extended at current x
for (let x = 0; x < W; x++) {
  used.clear();
  for (const y of topAt[x]) {
    let hit = -1;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (used.has(i)) continue;
      const s = segs[i];
      if (s.x1 === x - 1 && Math.abs(y - s.ys[s.ys.length - 1]) <= 1) { hit = i; break; }
    }
    if (hit >= 0) { segs[hit].x1 = x; segs[hit].ys.push(y); used.add(hit); }
    else segs.push({ x0: x, x1: x, ys: [y] });
  }
}
// 过滤：宽度≥8；头room（角色高 57px：站在 (cx, y-1) 头顶到 y-58 无实心）；
// 注意斜面上角色中心在脚点上方，取段中部采样
const CHAR_H = 57, HALF_W = 15;
const out = [];
for (const s of segs) {
  if (s.x1 - s.x0 < 8) continue;
  const yl = s.ys[0], yr = s.ys[s.ys.length - 1];
  const cx = Math.round((s.x0 + s.x1) / 2), cy = s.ys[Math.floor(s.ys.length / 2)];
  // 头room：以站点 (cx, cy-1) 上方 57px 内无实心（检查身体带 cx±HALF_W, [cy-CHAR_H, cy]）
  let blocked = 0;
  for (let dy = 1; dy <= CHAR_H; dy++) {
    const y = cy - dy;
    if (y < 0) { blocked++; break; }
    if (isSolid(cx - HALF_W, y) || isSolid(cx + HALF_W, y)) { blocked = dy; break; }
  }
  const head = blocked ? cy - blocked : cy - CHAR_H;
  const slope = (yr - yl) / Math.max(1, s.x1 - s.x0);
  // 液体：表面正上方是否水（ice 后不算）
  let wet = 0;
  for (let x = s.x0; x <= s.x1; x += 4) if (isWater(x, cy - 2)) { wet = 1; break; }
  out.push({ x0: s.x0, x1: s.x1, yl, yr, slope: +slope.toFixed(3), head, wet });
}
out.sort((a, b) => a.yl - b.yl || a.x0 - b.x0);
console.log("== standable surfaces (x0-x1, yLeft→yRight, slope, headroomTop, wet) ==");
for (const o of out) console.log(`x[${String(o.x0).padStart(4)},${String(o.x1).padStart(4)}] y ${String(o.yl).padStart(3)}→${String(o.yr).padStart(3)} sl=${o.slope >= 0 ? "+" : ""}${o.slope} head@${o.head}${o.wet ? " WET" : ""}`);

// ── 液体精参 ──
for (const run of runs) {
  const C0 = run.col0 * 32, R = run.row * 32, C1 = (run.col1 + 1) * 32;
  const surf = R;
  // 床顶：沿 liquid 中轴向下找第一个 solid→air 边界之上的 solid 表面
  const xm = Math.round((C0 + C1) / 2);
  let bed = -1;
  for (let y = surf + 40; y < surf + 120; y++) if (isSolid(xm, y) && isSolid(xm, y - 1)) { bed = y; break; }
  console.log(`liquid col[${run.col0}-${run.col1}] row=${run.row}: 表面=${surf} 盖西=[${C0},${C0 + 41.6}] 盖东=[${C1 - 32},${C1 - 9.6}]+楔 床顶~${bed} kind=${run.kind ?? run.type ?? "?"}`);
}

// ── 机关 ──
const M = w.mechSnapshot?.() ?? {};
console.log("== mechs ==", JSON.stringify(M).slice(0, 1200));

// 封印证据 A：真实身体形状的站立场全图 + 传送-跳跃扫掠 → 门架/shelf 可达性
// 身体 solid（屏坐标, 脚底py 为基准, cy=py-35.2）:
//   躯干圆: 圆心(cy-6.4, x), 半径15.36
//   梯形: 顶(cy-6.4, ±14.4) → 底(cy+28.8, ±5.44)
import { readFileSync } from "node:fs";
const doc = JSON.parse(readFileSync("data/forest/levels/forest_21.json", "utf8"));
const L = doc.layers.find(l => l.type === "tilelayer");
const W = L.width, H = L.height;
const G = (c, r) => (c < 0 || c >= W || r < 0 || r >= H) ? 0 : L.data[r * W + c];
const T = g => g === 0 ? 0 : ((g - 1) % 7) + 1;
const surf = (t, lx) => t === 2 ? 32 - lx : t === 3 ? lx : t === 4 ? lx : t === 5 ? 32 - lx : 0;
// 瓦 solid 深度函数：返回该瓦在 lx 列的 solid 区间 [y0,y1]（屏坐标），无则 null
function tileSpan(t, lx, ry) {
  if (t === 1) return [ry, ry + 32];
  if (t >= 6) return null;
  const s = surf(t, Math.min(31, Math.max(0, lx)));
  return [ry + s, ry + 32];
}
// 身体在高度 y 处的半宽（相对脚底 py）：返回该水平线的实体半宽（0=无）
// 段: 脚底~+28.8 梯形(5.44→14.4 向上变宽), 圆心在 py-41.6?? 躯干圆心 = cy-6.4 = py-41.6, r15.36 → 圆顶 py-56.96
function bodyHalfW(py, y) {
  const bot = py - 6.4, top = py - 28.8;       // 梯形底/顶(屏y, 上小)
  if (y >= bot && y <= py - 0) {               // 梯形区: cy-6.4??
  }
  return 0;
}
// 简化精确：身体 solid = 梯形[(±5.44, py-6.4)→(±14.4, py-28.8)?? 不对——
// phys: y1=+0.2m(顶) y2=-0.9m(底) → 屏: 顶=cy-6.4, 底=cy+28.8, cy=py-35.2
// 梯形顶宽 ±14.4 @ 屏 y=py-41.6?? cy-6.4 = py-35.2-6.4 = py-41.6; 底 ±5.44 @ py-6.4
// 躯干圆: 圆心 @ py-41.6, r 15.36 → 覆盖 py-56.96 ~ py-26.24
function hitBody(px, py, tx0, ty0, tx1, ty1) {
  // 梯形（py-41.6 宽14.4 → py-6.4 宽5.44）
  const tyTop = py - 41.6, tyBot = py - 6.4;
  if (ty1 > tyTop && ty0 < tyBot) {
    const yA = Math.max(ty0, tyTop), yB = Math.min(ty1, tyBot);
    for (let y = yA; y <= yB; y += 1) {
      const f = (y - tyTop) / 35.2;
      const hw = 14.4 - 8.96 * f;
      if (px + hw > tx0 && px - hw < tx1) return true;
    }
  }
  // 躯干圆（圆心 py-41.6, r15.36）
  const cy = py - 41.6;
  if (ty1 > cy - 15.36 && ty0 < cy + 15.36) {
    const yA = Math.max(ty0, cy - 15.36), yB = Math.min(ty1, cy + 15.36);
    for (let y = yA; y <= yB; y += 1) {
      const dy = y - cy;
      const hw = Math.sqrt(Math.max(0, 15.36 * 15.36 - dy * dy));
      if (px + hw > tx0 && px - hw < tx1) return true;
    }
  }
  return false;
}
function blocked(px, py) {
  const c0 = Math.floor((px - 16) / 32), c1 = Math.floor((px + 16) / 32);
  const r0 = Math.max(0, Math.floor((py - 57) / 32)), r1 = Math.floor((py - 5) / 32);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = T(G(c, r));
    if (!t || t >= 6) continue;
    const x0 = Math.max(px - 16, c * 32), x1 = Math.min(px + 16, (c + 1) * 32);
    if (x1 <= x0) continue;
    for (let lx = Math.floor(x0 - c * 32); lx <= Math.ceil(x1 - c * 32); lx++) {
      const sp = tileSpan(t, lx, r * 32);
      if (!sp) continue;
      if (hitBody(px, py, c * 32 + Math.max(0, lx - 1), sp[0], c * 32 + Math.min(32, lx + 1), sp[1])) return true;
    }
  }
  return false;
}
// 采样站立场
const spots = [];
for (let r = 1; r < H; r++) for (let c = 0; c < W; c++) {
  const t = T(G(c, r));
  if (!t || t >= 6) continue;
  if (t === 1) {
    const a = T(G(c, r - 1));
    if (a === 0 || a >= 2) for (let lx = 2; lx <= 30; lx += 4) { const px = c * 32 + lx, py = r * 32; if (!blocked(px, py)) spots.push([px, py]); }
  } else {
    for (let lx = 2; lx <= 30; lx += 4) { const px = c * 32 + lx, py = r * 32 + surf(t, lx); if (!blocked(px, py)) spots.push([px, py]); }
  }
}
console.log("standable spots:", spots.length);
// 目标区: 门架顶面 [416,576]x[185,200]（站上门架）; shelf 顶面 [480,832]x[218,230]; fb门区 [448,544]x[140,200](中心)
function inZone(px, py) {
  if (px >= 416 && px <= 576 && py >= 186 && py <= 198) return "DOORSHELF";
  if (px >= 480 && px <= 832 && py >= 218 && py <= 230) return "SHELF";
  return null;
}
// 抛物线跳跃采样：从每个 spot，8方向×3速度，步进检测进入目标区
let reach = new Map();
for (const [sx, sy] of spots) {
  for (const dir of [-1, 1]) for (const v of [1.5, 3, 4.55]) {
    let x = sx, y = sy, vy = -7.7;
    for (let f = 0; f < 45; f++) {
      vy += 0.77; y += vy; x += v * dir;
      if (y > 940 || blocked(x, y + 4)) break;
      const z = inZone(x, y);
      if (z) { if (!reach.has(z)) reach.set(z, []); reach.get(z).push([Math.round(sx), Math.round(sy)]); }
    }
    // 平走
    let wx = sx + v * dir, wy = sy;
    const z2 = inZone(wx, wy);
    if (z2 && !blocked(wx, wy)) { if (!reach.has(z2)) reach.set(z2, []); reach.get(z2).push([Math.round(sx), Math.round(sy)]); }
  }
}
for (const [z, arr] of reach) {
  const uniq = [...new Set(arr.map(a => a.join(",")))];
  console.log(`${z}: ${uniq.length} 个起点可入 → ${uniq.slice(0, 12).join(" ")}`);
}
if (!reach.size) console.log("无任何站立场可跳/走入 shelf 或门架顶面");
// 附：站立场按 y 分布（WEST ROAD 组件 y<=290 的所有 spot）
const west = spots.filter(([x, y]) => y <= 300);
console.log("y<=300 的站立场:", west.map(([x, y]) => `${Math.round(x)}@${Math.round(y)}`).join(" "));

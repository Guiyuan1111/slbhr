// etutorial-analyze-geom.mjs — 后处理 et-dump.json：地面 fixture 分层段表 + 熔岩/机关实体 bbox + 角色碰撞盒
// 用法: node etutorial-analyze-geom.mjs [dump路径，默认 TEMP/fw-oe-1/et-dump.json]
import { readFileSync } from "node:fs";

const path = process.argv[2] || "/home/gy/桌面/dev/slbhr/TEMP/fw-oe-1/et-dump.json";
const d = JSON.parse(readFileSync(path, "utf8"));
const r1 = (v) => Math.round(v * 10) / 10;

function bbox(vs) {
  const xs = vs.map((p) => p[0]), ys = vs.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function slanted(vs) {
  // 是否含非轴对齐边（楔形证据）
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length];
    if (Math.abs(a[0] - b[0]) > 0.5 && Math.abs(a[1] - b[1]) > 0.5) return true;
  }
  return false;
}

console.log("=== A. 地面 fixture 分层（按顶面 y 聚类；screen px，y 向下） ===");
const ground = d.groundFixtures.filter((f) => f.kind === "poly").map((f) => ({ ...bbox(f.vs), vs: f.vs, slant: slanted(f.vs), fric: f.fric }));
const byTop = new Map();
for (const g of ground) {
  const key = Math.round(g.y0 / 32) * 32;
  if (!byTop.has(key)) byTop.set(key, []);
  byTop.get(key).push(g);
}
const levels = [...byTop.keys()].sort((a, b) => a - b);
for (const lv of levels) {
  const items = byTop.get(lv).sort((a, b) => a.x0 - b.x0);
  const spans = [];
  for (const it of items) {
    const last = spans[spans.length - 1];
    if (last && it.x0 - last.x1 < 2) last.x1 = Math.max(last.x1, it.x1);
    else spans.push({ x0: it.x0, x1: it.x1 });
  }
  const thick = Math.round(Math.max(...items.map((i) => i.y1 - i.y0)) * 10) / 10;
  const slants = items.filter((i) => i.slant).length;
  console.log(
    `top=${String(lv).padStart(5)}  spans=${spans.map((s) => `${r1(s.x0)}-${r1(s.x1)}`).join(", ")}  maxThick=${thick} slantedFx=${slants}`
  );
}

console.log("\n=== B. 非地面实体 bbox（世界 extra bodies） ===");
d.worldBodies.forEach((b, i) => {
  const pts = [];
  const kinds = [];
  for (const s of b.shapes || []) {
    kinds.push(s.kind);
    if (s.kind === "poly") pts.push(...s.vs);
    else if (s.kind === "circle") pts.push([s.cx - s.r, s.cy - s.r], [s.cx + s.r, s.cy + s.r]);
  }
  if (!pts.length) return;
  const bb = bbox(pts.map((p) => [p[0], p[1]]));
  const tag = b.ud || (kinds.length > 1 ? `multi(${kinds.join("/")})` : kinds[0]);
  console.log(
    `body[${i}] center=(${r1(b.screen.x)},${r1(b.screen.y)}) type=${b.type} ud=${b.ud ?? "-"} n=${kinds.length} bbox x[${r1(bb.x0)},${r1(bb.x1)}] y[${r1(bb.y0)},${r1(bb.y1)}]`
  );
});

console.log("\n=== C. 机关设备运行时状态 ===");
for (const o of d.objects) {
  console.log(
    `obj[${o.i}] ${o.ctor} type=${o.otype} body=${o.body ? `(${r1(o.body.x)},${r1(o.body.y)})` : "-"} state=${o.state ?? "-"} x=${o.options.x} y=${o.options.y} props=${JSON.stringify(o.options.properties || {})}` +
      (o.options.dy != null ? ` dy=${o.options.dy}` : "") +
      (o.options.density != null ? ` density=${o.options.density}` : "")
  );
}

console.log("\n=== D. 角色碰撞盒（躯干多边形 + 圆） ===");
for (const k of ["pers1", "pers2"]) {
  const P = d[k];
  const polys = P.shapes.filter((s) => s.kind === "poly");
  const circles = P.shapes.filter((s) => s.kind === "circle");
  for (const p of polys) {
    const bb = bbox(p.vs);
    console.log(`${k} torso: x[${r1(bb.x0)},${r1(bb.x1)}] y[${r1(bb.y0)},${r1(bb.y1)}] w=${r1(bb.x1 - bb.x0)} h=${r1(bb.y1 - bb.y0)}`);
  }
  for (const c of circles) console.log(`${k} circle: c=(${r1(c.cx)},${r1(c.cy)}) r=${c.r}`);
  console.log(`${k} center=(${r1(P.body.x)},${r1(P.body.y)}) => physical feet = center + ${r1(P.shapes.filter(s=>s.kind==='circle').reduce((m,c)=>Math.max(m,c.cy+c.r),0) - P.body.y)}`);
}

console.log("\n=== E. 汇总 ===");
console.log("gravity(px/s^2 down):", JSON.stringify(d.gravity), " diamonds:", d.totalDiamonds, " level:", d.levelFilename);
console.log("door1(fb):", JSON.stringify(d.door1.pos), "sensorY", r1(d.door1.body.y), " door2(wg):", JSON.stringify(d.door2.pos), "sensorY", r1(d.door2.body.y));

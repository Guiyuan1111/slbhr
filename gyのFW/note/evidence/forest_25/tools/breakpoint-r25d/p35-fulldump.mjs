// 全图 static fixture dump（含 label 网格化摘要）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
import { writeFileSync } from "node:fs";
const w = makeWorld("forest_25");
const rows = [];
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  if (b.GetType() !== 0) continue;
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    if (f.IsSensor()) continue;
    const sh = f.GetShape();
    const cnt = sh.m_count ?? 0, verts = sh.m_vertices;
    if (!verts || cnt < 3) continue;
    const vs = [];
    for (let i = 0; i < cnt; i++) { const p = verts[i]; if (!p) continue; vs.push({ x: -p.x * 32, y: -p.y * 32 }); }
    if (vs.length < 3) continue;
    const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    rows.push(`bbox(${x0.toFixed(0)},${y0.toFixed(0)})-(${x1.toFixed(0)},${y1.toFixed(0)}) n=${vs.length}  ${vs.map(v=>`(${v.x.toFixed(0)},${v.y.toFixed(0)})`).join(" ")}`);
  }
}
rows.sort((a, b) => {
  const pa = (a.match(/bbox\((-?\d+),(-?\d+)\)-\((-?\d+),(-?\d+)\)/) || [0,9999,9999,0,0]).slice(1).map(Number);
  const pb = (b.match(/bbox\((-?\d+),(-?\d+)\)-\((-?\d+),(-?\d+)\)/) || [0,9999,9999,0,0]).slice(1).map(Number);
  return pa[1] - pb[1] || pa[0] - pb[0];
});
writeFileSync("TEMP/r25d/all-fixtures.txt", rows.join("\n") + "\n");
console.log("total fixtures:", rows.length);
// 按行带汇总：y 每 32px 一带，列出 x 区间
const bands = {};
for (const r of rows) {
  const m = r.match(/bbox\((-?\d+),(-?\d+)\)-\((-?\d+),(-?\d+)\)/);
  if (!m) continue;
  const [, x0, y0, x1, y1] = m.map(Number);
  for (let yy = Math.floor(y0 / 32) * 32; yy < y1; yy += 32) {
    (bands[yy] ??= []).push(`[${x0}-${x1}]`);
  }
}
for (const yy of Object.keys(bands).map(Number).sort((a, b) => a - b)) {
  console.log(`y${String(yy).padStart(4)}: ${bands[yy].join(" ")}`);
}

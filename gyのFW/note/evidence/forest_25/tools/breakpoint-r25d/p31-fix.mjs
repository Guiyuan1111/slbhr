// 验证：x[80,340] y[32,300] 区间 static fixtures（柱顶封顶? terrace 西延? ledge/柱/墙 精确分段）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
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
    if (x1 < 78 || x0 > 342 || y1 < 30 || y0 > 302) continue;
    console.log(`bbox(${x0.toFixed(0)},${y0.toFixed(0)})-(${x1.toFixed(0)},${y1.toFixed(0)})  ${vs.map(v=>`(${v.x.toFixed(0)},${v.y.toFixed(0)})`).join(" ")}`);
  }
}

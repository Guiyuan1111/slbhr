// t32: 板台/竖井区 (x[880,1140] y[220,370]) 静态 fixture 精确 dump（屏幕系多边形顶点）
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_21");
const bw = w.mechs.winds[0].body.GetWorld();
for (let b = bw.GetBodyList(); b; b = b.GetNext()) {
  if (b.GetType() !== 0) continue;
  const xf = b.GetTransform();
  const c = Math.cos(xf.q.s ?? xf.q.a), s = Math.sin(xf.q.s ?? xf.q.a);
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    if (f.IsSensor()) continue;
    const sh = f.GetShape();
    if (!sh.m_count) continue;
    const poly = [];
    let inWin = false;
    for (let i = 0; i < sh.m_count; i++) {
      const wx = xf.p.x + c * sh.m_vertices[i].x - s * sh.m_vertices[i].y;
      const wy = xf.p.y + s * sh.m_vertices[i].x + c * sh.m_vertices[i].y;
      const sx = wx * -32, sy = wy * -32;
      poly.push([+sx.toFixed(1), +sy.toFixed(1)]);
      if (sx > 860 && sx < 1160 && sy > 200 && sy < 390) inWin = true;
    }
    if (inWin) console.log(poly.map(p => `(${p[0]},${p[1]})`).join(" "));
  }
}

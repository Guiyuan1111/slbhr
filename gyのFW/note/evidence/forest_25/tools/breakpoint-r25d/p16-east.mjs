// 完整测绘东部下降结构 x1040-1260 y280-790
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const m2px = (v) => ({ x: -v.x * 32, y: -v.y * 32 });
const body = w.built.groundBody;
for (let f = body.GetFixtureList(); f; f = f.GetNext()) {
  const sh = f.GetShape();
  const cnt = sh.m_count ?? 0, verts = sh.m_vertices;
  if (!verts || cnt < 2) continue;
  const vs = Array.from({ length: cnt }, (_, i) => m2px(verts[i]));
  const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 > 1040 && x0 < 1260 && y1 > 280 && y0 < 790) {
    console.log(`bbox(${Math.round(x0)},${Math.round(y0)})-(${Math.round(x1)},${Math.round(y1)})  ${vs.map(v=>`(${Math.round(v.x)},${Math.round(v.y)})`).join(" ")}`);
  }
}

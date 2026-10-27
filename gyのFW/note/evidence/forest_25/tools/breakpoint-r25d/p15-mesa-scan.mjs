// 扫 mesa 顶 x800-1140 y210-330 的所有 fixture（static 体变换为恒等，直接取顶点）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const m2px = (v) => ({ x: -v.x * 32, y: -v.y * 32 });
const body = w.built.groundBody;
let n = 0;
for (let f = body.GetFixtureList(); f; f = f.GetNext()) {
  const sh = f.GetShape();
  const cnt = sh.m_count ?? 0, verts = sh.m_vertices;
  if (!verts || cnt < 2) continue;
  const vs = Array.from({ length: cnt }, (_, i) => m2px(verts[i]));
  const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 > 790 && x0 < 1140 && y1 > 210 && y0 < 330) {
    n++;
    console.log(`bbox(${Math.round(x0)},${Math.round(y0)})-(${Math.round(x1)},${Math.round(y1)})  ${vs.map(v=>`(${Math.round(v.x)},${Math.round(v.y)})`).join(" ")}`);
  }
}
console.log("n=", n);

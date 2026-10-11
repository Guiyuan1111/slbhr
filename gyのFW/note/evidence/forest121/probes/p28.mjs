import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_12_1");
const g = w.built.groundBody;
const rows = [];
for (let f = g.GetFixtureList(); f; f = f.GetNext()) {
  const sh = f.GetShape();
  if (sh.GetType() !== 2) continue;
  const pts = [];
  for (let i = 0; i < sh.m_count; i++) pts.push([(-sh.m_vertices[i].x * 32).toFixed(1), (-sh.m_vertices[i].y * 32).toFixed(1)]);
  const ys = pts.map(p => +p[1]), xs = pts.map(p => +p[0]);
  const miny = Math.min(...ys), maxy = Math.max(...ys), minx = Math.min(...xs), maxx = Math.max(...xs);
  if (miny < 900 && maxy > 560) rows.push({ miny, minx, s: pts.map(p => `(${p[0]},${p[1]})`).join(" ") });
}
rows.sort((a, b) => a.miny - b.miny || a.minx - b.minx);
for (const r of rows) console.log(r.s);

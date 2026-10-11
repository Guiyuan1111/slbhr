import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_12_1");
const world = w["built"].world;
const out = [];
for (let b = world.GetBodyList(); b; b = b.GetNext()) {
  if (b.GetType() !== 0) continue;
  const pos = b.GetPosition(), ang = b.GetAngleRadians();
  const cos = Math.cos(ang), sin = Math.sin(ang);
  for (let fx = b.GetFixtureList(); fx; fx = fx.GetNext()) {
    const sh = fx.GetShape();
    const verts = sh.m_vertices, n = sh.m_count ?? sh.m_vertexCount ?? 0;
    if (!verts || !n) continue;
    const scr = [];
    for (let i=0;i<n;i++){
      const x = verts[i].x, y = verts[i].y;
      const rx = cos*x - sin*y, ry = sin*x + cos*y;
      scr.push([-(pos.x+rx)*32, -(pos.y+ry)*32]);
    }
    if (scr.some(([,y]) => y < 620)) out.push(scr.map(([x,y])=>`(${x.toFixed(1)},${y.toFixed(1)})`).join(" "));
  }
}
console.log(out.join("\n"));

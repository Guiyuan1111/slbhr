// r23b: dump ALL fixtures (world coords, px) to stdout JSON, with type tags.
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const w = makeWorld("forest_23");
const tmp = new w.B.b2Vec2();
const bodies = [];
let nb = 0;
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  nb++;
  const fixtures = [];
  for (let fx = b.GetFixtureList(); fx; fx = fx.GetNext()) {
    const sh = fx.GetShape();
    const n = sh.m_count ?? sh.m_vertexCount;
    if (!n || !sh.m_vertices) { fixtures.push({ shape: sh.GetType?.() ?? "unknown" }); continue; }
    const pts = [];
    for (let i = 0; i < n; i++) {
      const wp = b.GetWorldPoint(new w.B.b2Vec2(sh.m_vertices[i].x, sh.m_vertices[i].y), tmp);
      pts.push([Math.round(-wp.x * 32 * 10) / 10, Math.round(-wp.y * 32 * 10) / 10]);
    }
    fixtures.push({ pts, sensor: fx.IsSensor() });
  }
  bodies.push({ type: b.GetType(), fixtures });
}
console.error(`bodies=${nb}`);
process.stdout.write(JSON.stringify(bodies));

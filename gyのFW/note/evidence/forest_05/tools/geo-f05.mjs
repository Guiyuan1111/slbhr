// forest_05 全刚体顶点 + 机关
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_05");
const world = w.built?.world ?? w.world;
console.log("== mechanisms:", Object.keys(w.mechanisms||{}).map(k=>`${k}:${(w.mechanisms[k]||[]).length}`).join(" "));
console.log("== players:", JSON.stringify(w.snapshotPlayer("fireboy")), JSON.stringify(w.snapshotPlayer("watergirl")));
let b = world.GetBodyList(), n = 0, out = [];
while (b) {
  let fx = b.GetFixtureList();
  while (fx) {
    const sh = fx.GetShape();
    if (sh.m_vertices) {
      const pts = sh.m_vertices.slice(0, 8).map(q => ({ x: +((b.GetPosition().x + q.x) * -32).toFixed(0), y: +((b.GetPosition().y + q.y) * -32).toFixed(0) }));
      out.push(`b${n} ud=${b.GetUserData()}: ` + pts.map(p => `(${p.x},${p.y})`).join(" "));
    }
    fx = fx.GetNext();
  }
  b = b.GetNext(); n++;
}
console.log(out.join("\n"));

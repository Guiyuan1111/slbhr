// pbox.mjs — 盒选内核刚体多边形（换算同 geo-f29 rotVert 口径）
// 用法: node --import tsx pbox.mjs x0 x1 y0 y1
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const [x0, x1, y0, y1] = process.argv.slice(2).map(Number);
const w = makeWorld("forest_29");
const world = w.built?.world ?? w.world;
function rotVert(body, q) {
  const c = Math.cos(body.GetAngle()), s = Math.sin(body.GetAngle());
  const wx = body.GetPosition().x + c * q.x - s * q.y;
  const wy = body.GetPosition().y + s * q.x + c * q.y;
  return { x: +(-wx * 32).toFixed(1), y: +(-wy * 32).toFixed(1) };
}
let b = world.GetBodyList(), n = 0;
while (b) {
  let fx = b.GetFixtureList();
  while (fx) {
    const sh = fx.GetShape();
    if (sh.GetType && sh.GetType() === 2 && sh.m_vertices) {
      const pts = sh.m_vertices.slice(0, 8).map(q => rotVert(b, q));
      if (pts.some(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) {
        n++;
        console.log(`sud=${JSON.stringify(b.GetUserData())} fsud=${JSON.stringify(fx.GetUserData ? fx.GetUserData() : fx.m_userData ?? "")} sens=${fx.IsSensor()} ${pts.map(p => `(${p.x},${p.y})`).join(" ")}`);
      }
    }
    fx = fx.GetNext();
  }
  b = b.GetNext();
}
console.log(`== ${n} polys in x[${x0},${x1}] y[${y0},${y1}]`);

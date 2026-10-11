// t27b: 三风柱传感器 AABB（屏幕系，正确 q.c/q.s 变换）+ 机身/门/钻石——再封文档权威数字
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_21");
const c = v => Math.round(v * 1e3) / 1e3;
for (let i = 0; i < w.mechs.winds.length; i++) {
  const wind = w.mechs.winds[i];
  const body = wind.body;
  const st = body.GetPosition();
  const ang = body.GetAngle() * 180 / Math.PI;
  console.log(`wind[${i}] body=(${c(-st.x * 32)}, ${c(-st.y * 32)}) state=${wind.state} lenM=${wind.lengthM} bodyAngle=${c(ang)}°`);
  const xf = body.GetTransform();
  const co = xf.q.c, sn = xf.q.s;
  for (let fx = body.GetFixtureList(); fx; fx = fx.GetNext()) {
    if (!fx.IsSensor()) continue;
    const s = fx.GetShape();
    if (!s.m_count) continue;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let k = 0; k < s.m_count; k++) {
      const wx = xf.p.x + co * s.m_vertices[k].x - sn * s.m_vertices[k].y;
      const wy = xf.p.y + sn * s.m_vertices[k].x + co * s.m_vertices[k].y;
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
    }
    console.log(`  sensorAABB screen x[${c(-maxX * 32)}, ${c(-minX * 32)}] y[${c(-minY * 32)}, ${c(-maxY * 32)}]`);
  }
}
console.log("diamonds:", w.diamonds.map(d => `${d.char}@${d.x},${d.y}`).join("  "));

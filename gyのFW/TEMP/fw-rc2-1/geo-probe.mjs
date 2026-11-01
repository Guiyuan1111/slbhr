// geo-probe: 精确非 sensor fixture AABB 查询（区域参数化）
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const world = w.players.fireboy.body.GetWorld();
const FIX = [];
for (let b = world.GetBodyList(); b; b = b.GetNext()) {
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    if (!sh.m_vertices) continue;
    const p = b.GetPosition(), c = Math.cos(b.GetAngle()), s = Math.sin(b.GetAngle());
    const pts = [];
    for (let i = 0; i < sh.m_count; i++) {
      const v = sh.m_vertices[i];
      pts.push([-(c * v.x - s * v.y + p.x) * 32, -(s * v.x + c * v.y + p.y) * 32]);
    }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const u = f.GetUserData ? f.GetUserData() : f.m_userData;
    FIX.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
      sensor: f.IsSensor(), ud: u && typeof u === 'object' ? (u.portal ? 'portal:' + u.portal.portalId : Object.keys(u).join(',')) : String(u) });
  }
}
// regions: [x0,x1,y0,y1,label]
const REGIONS = [
  [560, 900, 96, 300, 'A: row4西端落差道+主地板东台'],
  [600, 900, 300, 620, 'B: 448阶+台面东段+row-19'],
  [0, 260, 460, 700, 'C: 台面西端+西阶+P3袋'],
  [440, 640, 96, 300, 'D: 楼梯/塔2/死台'],
  [0, 480, 96, 300, 'E: 塔1上部/北出口带'],
];
for (const [rx0, rx1, ry0, ry1, label] of REGIONS) {
  console.log(`\n=== ${label} x[${rx0},${rx1}] y[${ry0},${ry1}] ===`);
  const hits = FIX.filter(fx => !fx.sensor && fx.x1 > rx0 && fx.x0 < rx1 && fx.y1 > ry0 && fx.y0 < ry1);
  hits.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const fx of hits) {
    console.log(`  solid x[${fx.x0.toFixed(1)},${fx.x1.toFixed(1)}] y[${fx.y0.toFixed(1)},${fx.y1.toFixed(1)}]  ud=${fx.ud}`);
  }
}

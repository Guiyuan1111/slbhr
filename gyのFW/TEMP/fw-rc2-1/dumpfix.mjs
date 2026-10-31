import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const world = w.players.fireboy.body.GetWorld();
for (let b = world.GetBodyList(); b; b = b.GetNext()) {
  // incl non-static
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
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 < 0 || x0 > 640 || y1 < 100 || y0 > 620) continue;
    console.log(pts.map(q => `(${q[0].toFixed(0)},${q[1].toFixed(0)})`).join(' '), `ud=${(() => { const u = f.GetUserData ? f.GetUserData() : f.m_userData; if (!u || typeof u !== 'object') return JSON.stringify(u); const o = { ...u }; if (o.portal) o.portal = { portalId: o.portal.portalId, state: o.portal.state, x: Math.round(-o.portal.body.GetPosition().x * 32), y: Math.round(-o.portal.body.GetPosition().y * 32), other: o.portal.other ? { portalId: o.portal.other.portalId, y: Math.round(-o.portal.other.body.GetPosition().y * 32) } : null }; return JSON.stringify(o); })()} sensor=${f.IsSensor()} type=${b.GetType()}`);
  }
}

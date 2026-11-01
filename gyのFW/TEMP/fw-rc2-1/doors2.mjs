// doors2: 门 sensor AABB + 全 portal 表（活世界直读）
import { makeWorld } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("crystal_03");
const world = w.players.fireboy.body.GetWorld();
console.log("== doors ==");
for (const [k, d] of Object.entries(w.doors)) {
  console.log(k, JSON.stringify({ pos: d.pos, isUp: d.isUp, isOpen: d.isOpen, body: !!d.body }));
  for (let f = d.body?.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    const c = d.pos;
    const hw = sh.m_radius !== undefined && sh.m_type === 'circle' ? sh.m_radius : null;
    console.log(`  fixture sensor=${f.IsSensor()} type=${sh.m_type} shape=`, sh.m_type === 'polygon' ? JSON.stringify((sh.m_vertices ?? []).map(v => [+(v.x*32).toFixed(1), +(v.y*32).toFixed(1)])) : { r: sh.m_radius });
  }
}
console.log("== portals ==");
for (const p of (w.portals ?? [])) {
  console.log("portal", p.portalId, "pos", JSON.stringify(p.pos), "otherId", p.other?.portalId);
  const b = p.body ?? p.sensor?.body;
  for (let f = b?.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    console.log(`  sensor=${f.IsSensor()} type=${sh.m_type} shape=`, sh.m_type === 'polygon' ? JSON.stringify((sh.m_vertices ?? []).map(v => [+(v.x*32).toFixed(1), +(v.y*32).toFixed(1)])) : { r: sh.m_radius });
  }
}

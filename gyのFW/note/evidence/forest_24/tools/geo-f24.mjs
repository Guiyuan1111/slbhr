// forest_24 全刚体顶点 + 机关 f0 快照（模式同 note/evidence/forest_19/tools/geo-f19.mjs）
// 运行位置: TEMP/flashbp24/（相对路径 ../../scripts = gyのFW 根）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_24");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
console.log("== mechanisms:", Object.keys(M || {}).map(k => `${k}:${(M[k] || []).length}`).join(" "));
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(1), y: +(b.GetPosition().y * -32).toFixed(1) });
console.log("== players f0:", JSON.stringify(w.snapshotPlayer("fireboy")), JSON.stringify(w.snapshotPlayer("watergirl")));
for (const p of M.pushers) console.log(`pusher g${p.group} state=${p.state} pos=`, px(p.body));
for (const pl of M.platforms) console.log(`platform g${pl.group} state=${pl.state} pos=`, px(pl.body), `angle=${(pl.body.GetAngle()*180/Math.PI).toFixed(1)}`);
for (const pr of M.props) console.log(`prop(${pr.body.GetUserData?.() ?? ""}) pos=`, px(pr.body), ` mass=${pr.body.GetMass().toFixed(3)}`);
for (const u of M.pulleys) {
  console.log(`pulley p1=`, px(u.plat1), ` p2=`, px(u.plat2), ` p1mass=${u.plat1.GetMass().toFixed(3)} p2mass=${u.plat2.GetMass().toFixed(3)}`);
}
// 关节清单（pulley joint 绳长实证）
{
  let j = world.GetJointList();
  while (j) {
    const t = j.GetType ? j.GetType() : "?";
    if (typeof t === "number" && t === 4) { // e_pulleyJoint
      const keys = [];
      for (const k in j) { if (typeof k === "string" && /length|ratio/i.test(k)) keys.push(`${k}=${JSON.stringify(j[k])}`); }
      console.log(`  pulleyJoint fields: ${keys.join(" ")}`);
    }
    j = j.GetNext();
  }
}
for (const r of M.romans) {
  console.log(`roman bar=`, px(r.bar), ` angle=${(r.bar.GetAngle()*180/Math.PI).toFixed(2)}deg mass=${r.bar.GetMass().toFixed(3)} base=`, px(r.base), ` baseAngle=${(r.base.GetAngle()*180/Math.PI).toFixed(2)}`);
}
// 钻石/门/液体
console.log("== diamonds ==");
for (const d of w.built.diamonds ?? []) console.log(`  ${d.id} kind=${d.kind} char=${d.char} pos=`, px(d.body), `raw=(${d.x},${d.y})`);
console.log("== doors ==");
for (const k of ["fireboy", "watergirl"]) { const d = w.built.doors[k]; console.log(`  ${k} char=${d.char} pos=`, px(d.body), ` hinge=(${d.pos.x},${d.pos.y})`); }
console.log("== liquids ==", (w.built.liquids ?? []).length);
let b = world.GetBodyList(), n = 0, out = [];
while (b) {
  let fx = b.GetFixtureList();
  while (fx) {
    const sh = fx.GetShape();
    if (sh.m_vertices) {
      const pts = sh.m_vertices.slice(0, 8).map(q => ({ x: +((b.GetPosition().x + q.x) * -32).toFixed(0), y: +((b.GetPosition().y + q.y) * -32).toFixed(0) }));
      const typ = sh.GetType ? (sh.GetType() === 2 ? "poly" : sh.GetType() === 0 ? "circle" : "t" + sh.GetType()) : "?";
      let extra = "";
      if (typ === "circle") extra = ` r=${(sh.m_radius * 32).toFixed(1)}`;
      const ud = fx.GetUserData ? fx.GetUserData() : fx.m_userData;
      const sensor = fx.IsSensor ? fx.IsSensor() : fx.m_isSensor;
      out.push(`b${n} ud=${JSON.stringify(b.GetUserData())} fud=${JSON.stringify(ud ?? null)}${sensor ? " SENSOR" : ""} ${typ}: ` + pts.map(p => `(${p.x},${p.y})`).join(" ") + extra);
    }
    fx = fx.GetNext();
  }
  b = b.GetNext(); n++;
}
console.log("== bodies:", n);
console.log(out.join("\n"));

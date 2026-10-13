// forest_19 全刚体顶点 + 机关 f0 快照（模式同 note/evidence/forest_05/tools/geo-f05.mjs）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_19");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
console.log("== mechanisms:", Object.keys(M || {}).map(k => `${k}:${(M[k] || []).length}`).join(" "));
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(1), y: +(b.GetPosition().y * -32).toFixed(1) });
console.log("== players f0:", JSON.stringify(w.snapshotPlayer("fireboy")), JSON.stringify(w.snapshotPlayer("watergirl")));
for (const p of M.pushers) console.log(`pusher g${p.group} state=${p.state} pos=`, px(p.body));
for (const pl of M.platforms) console.log(`platform g${pl.group} state=${pl.state} pos=`, px(pl.body), `angle=${(pl.body.GetAngle()*180/Math.PI).toFixed(1)}`);
for (const pr of M.props) console.log(`prop(${pr.body.GetUserData?.() ?? ""}) pos=`, px(pr.body));
for (const h of M.hangings) console.log(`hanging anchor=`, px(h.anchor), ` plat=`, px(h.platform), ` angle=${(h.platform.GetAngle()*180/Math.PI).toFixed(2)}`);
for (const u of M.pulleys) console.log(`pulley p1=`, px(u.plat1), ` p2=`, px(u.plat2));
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
      out.push(`b${n} ud=${JSON.stringify(b.GetUserData())} ${typ}: ` + pts.map(p => `(${p.x},${p.y})`).join(" ") + extra);
    }
    fx = fx.GetNext();
  }
  b = b.GetNext(); n++;
}
console.log("== bodies:", n);
console.log(out.join("\n"));

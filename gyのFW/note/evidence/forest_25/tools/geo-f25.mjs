// forest_25 全刚体顶点 + 机关 f0 快照（模式同 note/evidence/forest_19/tools/geo-f19.mjs）
// 用法：cd TEMP/flashbp25 && node --import tsx geo-f25.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
console.log("== mechanisms:", Object.keys(M || {}).map(k => `${k}:${(M[k] || []).length}`).join(" "));
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(1), y: +(b.GetPosition().y * -32).toFixed(1) });
console.log("== players f0:", JSON.stringify(w.snapshotPlayer("fireboy")), JSON.stringify(w.snapshotPlayer("watergirl")));
for (const l of M.levers) console.log(`lever g${l.group} state=${l.state} angle=${(l.body.GetAngle()*180/Math.PI).toFixed(2)}deg ja=${(l.joint.GetJointAngleRadians()*180/Math.PI).toFixed(2)}deg pos=`, px(l.body));
for (const p of M.pushers) console.log(`pusher g${p.group} state=${p.state} t=${p.joint.GetJointTranslation().toFixed(3)} pos=`, px(p.body));
for (const pl of M.platforms) console.log(`platform g${pl.group} state=${pl.state} pos=`, px(pl.body), `angle=${(pl.body.GetAngle()*180/Math.PI).toFixed(1)}`);
for (const f of M.winds) {
  console.log(`wind g${f.group} state=${f.state} bodyPos=`, px(f.body), ` bodyAngle=${(f.body.GetAngle()*180/Math.PI).toFixed(3)}deg len=${f.lengthM}m`);
  let fx = f.body.GetFixtureList();
  while (fx) {
    const sh = fx.GetShape();
    if (sh.m_vertices) {
      const pts = sh.m_vertices.slice(0, 8).map(q => ({ x: +((f.body.GetPosition().x + q.x) * -32).toFixed(1), y: +((f.body.GetPosition().y + q.y) * -32).toFixed(1) }));
      console.log(`  wind fixture sensor=${fx.IsSensor()} ud=${JSON.stringify(fx.GetUserData?.() ?? fx.m_userData ?? "")}: ` + pts.map(p => `(${p.x},${p.y})`).join(" "));
    }
    fx = fx.GetNext();
  }
}
for (const h of M.hangings) console.log(`hanging anchor=`, px(h.anchor), ` plat=`, px(h.platform), ` angle=${(h.platform.GetAngle()*180/Math.PI).toFixed(2)}`);
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
      const sud = fx.GetUserData ? fx.GetUserData() : fx.m_userData;
      out.push(`b${n} ud=${JSON.stringify(b.GetUserData())} fsud=${JSON.stringify(sud ?? "")} sens=${fx.IsSensor()} ${typ}: ` + pts.map(p => `(${p.x},${p.y})`).join(" ") + extra);
    }
    fx = fx.GetNext();
  }
  b = b.GetNext(); n++;
}
console.log("== bodies:", n);
console.log(out.join("\n"));

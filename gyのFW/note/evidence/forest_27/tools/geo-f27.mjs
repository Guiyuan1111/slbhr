// forest_27 全刚体顶点 + 机关 f0 快照（模式同 geo-f25.mjs）
// 25 号档方法论修正：夹具顶点一律加 body 旋转再出世界坐标（风机/转臂必须，本关风机体角 0、转臂体角 0，
// 但仍按旋转公式算，杜绝 25 §7.3 那类未旋转误读）。
// 用法：cd TEMP/flashbp27 && node --import tsx geo-f27.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_27");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
console.log("== mechanisms:", Object.keys(M || {}).map(k => `${k}:${(M[k] || []).length}`).join(" "));
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(2), y: +(b.GetPosition().y * -32).toFixed(2) });
console.log("== players f0:", JSON.stringify(w.snapshotPlayer("fireboy")), JSON.stringify(w.snapshotPlayer("watergirl")));
console.log("== diamonds:", w.diamonds.map(d => ({ id: d.id, kind: d.kind, char: d.char, x: +(d.x), y: +(d.y), collected: d.collected })));
console.log("== doors:", JSON.stringify({ ...w.doors.fireboy, body: undefined }), JSON.stringify({ ...w.doors.watergirl, body: undefined }));
console.log("== liquids:", w.liquids.map(l => ({ kind: l.kind, type: l.liquidType, row: l.row, col: l.col0 + ".." + l.col1 })));

for (const l of M.levers) console.log(`lever l g${l.group} state=${l.state} angle=${(l.body.GetAngle()*180/Math.PI).toFixed(2)}deg ja=${(l.joint.GetJointAngleRadians()*180/Math.PI).toFixed(2)}deg motor=${l.joint.GetMotorSpeed().toFixed(2)} pos=`, px(l.body));
for (const p of M.pushers) console.log(`pusher g${p.group} state=${p.state} t=${p.joint.GetJointTranslation().toFixed(3)} motor=${p.joint.GetMotorSpeed().toFixed(2)} pos=`, px(p.body));
for (const pl of M.platforms) {
  const rev = pl.joint.GetJointAngleRadians !== undefined && pl.isRevolute;
  let jinfo = "";
  try { jinfo = ` ja=${(pl.joint.GetJointAngleRadians()*180/Math.PI).toFixed(2)}deg motor=${pl.joint.GetMotorSpeed().toFixed(2)}`; } catch {}
  console.log(`platform g${pl.group} state=${pl.state} pos=`, px(pl.body), `angle=${(pl.body.GetAngle()*180/Math.PI).toFixed(2)}deg${jinfo}`);
}
for (const f of M.winds) {
  const ang = f.body.GetAngle();
  console.log(`wind g${f.group} state=${f.state} bodyPos=`, px(f.body), ` bodyAngle=${(ang*180/Math.PI).toFixed(3)}deg len=${f.lengthM}m dir_b2=`, (() => { const d = f.body.GetWorldPoint ? null : null; return ""; })());
  let fx = f.body.GetFixtureList();
  while (fx) {
    dumpFixture(f.body, fx, "  wind");
    fx = fx.GetNext();
  }
}
for (const h of M.hangings) console.log(`hanging anchor=`, px(h.anchor), ` plat=`, px(h.platform), ` angle=${(h.platform.GetAngle()*180/Math.PI).toFixed(2)}`);
for (const pr of M.props) console.log(`prop kind=${pr.kind} pos=`, px(pr.body), ` angle=${(pr.body.GetAngle()*180/Math.PI).toFixed(2)}`);

function rotVert(body, q) {
  const c = Math.cos(body.GetAngle()), s = Math.sin(body.GetAngle());
  const wx = body.GetPosition().x + c*q.x - s*q.y;
  const wy = body.GetPosition().y + s*q.x + c*q.y;
  return { x: +(-wx*32).toFixed(1), y: +(-wy*32).toFixed(1) };
}
function dumpFixture(body, fx, tag) {
  const sh = fx.GetShape();
  const typ = sh.GetType === undefined ? "?" : (sh.GetType() === 2 ? "poly" : sh.GetType() === 0 ? "circle" : "t" + sh.GetType());
  const sud = fx.GetUserData ? fx.GetUserData() : fx.m_userData;
  if (typ === "circle") {
    const c = rotVert(body, { x: 0, y: 0 });
    console.log(`${tag} ud=${JSON.stringify(body.GetUserData())} fsud=${JSON.stringify(sud ?? "")} sens=${fx.IsSensor()} circle @(${c.x},${c.y}) r=${(sh.m_radius*32).toFixed(1)}`);
    return;
  }
  if (!sh.m_vertices) return;
  const pts = sh.m_vertices.slice(0, 8).map(q => rotVert(body, q));
  console.log(`${tag} ud=${JSON.stringify(body.GetUserData())} fsud=${JSON.stringify(sud ?? "")} sens=${fx.IsSensor()} poly(rot-applied): ` + pts.map(p => `(${p.x},${p.y})`).join(" "));
}

let b = world.GetBodyList(), n = 0, out = [];
while (b) {
  const bpos = px(b), bang = +(b.GetAngle()*180/Math.PI).toFixed(2);
  let fx = b.GetFixtureList();
  let any = false;
  while (fx) {
    const sh = fx.GetShape();
    const typ = sh.GetType ? (sh.GetType() === 2 ? "poly" : sh.GetType() === 0 ? "circle" : "t" + sh.GetType()) : "?";
    const sud = fx.GetUserData ? fx.GetUserData() : fx.m_userData;
    if (typ === "circle") {
      const c = rotVert(b, { x: 0, y: 0 });
      out.push(`b${n} ud=${JSON.stringify(b.GetUserData())} fsud=${JSON.stringify(sud ?? "")} sens=${fx.IsSensor()} circle @(${c.x},${c.y}) r=${(sh.m_radius*32).toFixed(1)}`);
      any = true;
    } else if (sh.m_vertices) {
      const pts = sh.m_vertices.slice(0, 8).map(q => rotVert(b, q));
      out.push(`b${n} ud=${JSON.stringify(b.GetUserData())} fsud=${JSON.stringify(sud ?? "")} sens=${fx.IsSensor()} poly: ` + pts.map(p => `(${p.x},${p.y})`).join(" "));
      any = true;
    }
    fx = fx.GetNext();
  }
  if (any) out.push(`  ^^ b${n} bodyPos=(${bpos.x},${bpos.y}) bodyAngle=${bang}deg`);
  b = b.GetNext(); n++;
}
console.log("== bodies:", n);
console.log(out.join("\n"));

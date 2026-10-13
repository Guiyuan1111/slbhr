// forest_29 全刚体顶点 + 机关 f0 快照（模式同 geo-f27.mjs；27 号档方法论：夹具顶点一律加 body 旋转再出世界坐标）
// 用法：cd TEMP/flashbp29 && node --import tsx geo-f29.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_29");
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
  let jinfo = "";
  try { jinfo = ` axis=${JSON.stringify(pl.joint.GetJointAxis?.() ?? "")} lo=${pl.joint.GetLowerTranslation?.()} hi=${pl.joint.GetUpperTranslation?.()} motor=${pl.joint.GetMotorSpeed().toFixed(2)}`; } catch {}
  console.log(`platform g${pl.group} state=${pl.state} revolute=${pl.isRevolute} pos=`, px(pl.body), `angle=${(pl.body.GetAngle()*180/Math.PI).toFixed(2)}deg${jinfo}`);
}
for (const pr of M.props) console.log(`prop kind=${pr.kind} pos=`, px(pr.body), ` angle=${(pr.body.GetAngle()*180/Math.PI).toFixed(2)}`);
for (const u of M.pulleys) {
  console.log(`pulley plat1=`, px(u.plat1), `plat2=`, px(u.plat2), ` (f0 未沉降)`);
}

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

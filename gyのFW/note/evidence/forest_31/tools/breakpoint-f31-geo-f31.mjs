// forest_31 全刚体顶点 + 机关 f0 快照（模式同 geo-f30.mjs）
// 25 号档方法论：夹具顶点一律加 body 旋转再出世界坐标。
// 本档新增：lever/platform 关节锚点直读（GetAnchorA，杜绝 f30 档支点手算偏差）。
// 用法：cd TEMP/flashbp31 && node --import tsx geo-f31.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_31");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
console.log("== mechanisms:", Object.keys(M || {}).map(k => `${k}:${(M[k] || []).length}`).join(" "));
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(2), y: +(b.GetPosition().y * -32).toFixed(2) });
const ppt = (v) => `(${+(v.x * -32).toFixed(2)},${+(v.y * -32).toFixed(2)})`;
console.log("== players f0:", JSON.stringify(w.snapshotPlayer("fireboy")), JSON.stringify(w.snapshotPlayer("watergirl")));
console.log("== diamonds:", w.diamonds.map(d => ({ id: d.id, kind: d.kind, char: d.char, x: +(d.x), y: +(d.y), collected: d.collected })));
console.log("== doors fb:", JSON.stringify({ ...w.doors.fireboy, body: undefined }), " pos(px)=", ppt(w.doors.fireboy.body.GetPosition()));
console.log("== doors wg:", JSON.stringify({ ...w.doors.watergirl, body: undefined }), " pos(px)=", ppt(w.doors.watergirl.body.GetPosition()));
console.log("== liquids:", w.liquids.map(l => ({ kind: l.kind, type: l.liquidType, row: l.row, col: l.col0 + ".." + l.col1, bodyPos: ppt(l.body.GetPosition()) })));

for (const l of M.levers) {
  const ja = (() => { try { return l.joint.GetJointAngleRadians(); } catch { return NaN; } })();
  console.log(`lever g${l.group} state=${l.state} angle=${(l.body.GetAngle()*180/Math.PI).toFixed(2)}deg ja=${(ja*180/Math.PI).toFixed(2)}deg motor=${l.joint.GetMotorSpeed().toFixed(2)} pos=`, px(l.body),
    "pivotAnchorA=", ppt(l.joint.GetAnchorA({x:0,y:0})), "limits=[", (l.joint.GetLowerLimit()*180/Math.PI).toFixed(1), ",", (l.joint.GetUpperLimit()*180/Math.PI).toFixed(1), "] maxMT=", l.joint.GetMaxMotorTorque?.() ?? "?", "mass=", l.body.GetMass().toFixed(4));
}
for (const p of M.pushers) {
  console.log(`pusher g${p.group} state=${p.state} t=${p.joint.GetJointTranslation().toFixed(3)} motor=${p.joint.GetMotorSpeed().toFixed(2)} pos=`, px(p.body),
    "anchorA=", ppt(p.joint.GetAnchorA({x:0,y:0})), "axis=", (() => { const v = p.joint.GetJointAxisDegrees ? null : null; try { const d = p.joint.GetLocalAxisA ? p.joint.GetLocalAxisA() : null; return d ? `(${d.x.toFixed(2)},${d.y.toFixed(2)})` : "?"; } catch { return "?"; } })(), "mass=", p.body.GetMass().toFixed(4));
}
for (const pl of M.platforms) {
  let jinfo = "", anchor = "";
  try { jinfo = ` ja=${(pl.joint.GetJointAngleRadians()*180/Math.PI).toFixed(2)}deg motor=${pl.joint.GetMotorSpeed().toFixed(2)}`; } catch {}
  try { anchor = " anchorA=" + ppt(pl.joint.GetAnchorA({x:0,y:0})); } catch {}
  console.log(`platform g${pl.group} state=${pl.state} pos=`, px(pl.body), `angle=${(pl.body.GetAngle()*180/Math.PI).toFixed(2)}deg mass=${pl.body.GetMass().toFixed(4)}${jinfo}${anchor}`);
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

// 机关体夹具明细
for (const l of M.levers) { let fx = l.body.GetFixtureList(); while (fx) { dumpFixture(l.body, fx, `lever-g${l.group}`); fx = fx.GetNext(); } }
for (const p of M.pushers) { let fx = p.body.GetFixtureList(); while (fx) { dumpFixture(p.body, fx, `pusher-g${p.group}`); fx = fx.GetNext(); } }
for (const pl of M.platforms) { let fx = pl.body.GetFixtureList(); while (fx) { dumpFixture(pl.body, fx, `platform-g${pl.group}`); fx = fx.GetNext(); } }

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

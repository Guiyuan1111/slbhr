// forest_18 拉杆探针 v2：禁刹车真扳杆 → group0(l0→p0,p1) / group2(l1→p4) 旋转响应
import { makeWorld } from "../../../../scripts/e2e/routetool/kernel.mjs";

const DT = 1 / 60;
const idle = () => ({ fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });

function platVerts(w, tag) {
  const world = w.built?.world ?? w.world;
  let b = world.GetBodyList(), i = 0, out = [];
  while (b) {
    const ud = b.GetUserData();
    // 平台 fixture 带 userData {reflection:true}
    let fx = b.GetFixtureList();
    while (fx) {
      if (fx.GetUserData() && fx.GetUserData().reflection && fx.GetShape().m_vertices) {
        const pts = fx.GetShape().m_vertices.slice(0, 4).map(q => ({
          x: +((b.GetPosition().x + q.x) * -32).toFixed(0),
          y: +((b.GetPosition().y + q.y) * -32).toFixed(0),
        }));
        out.push(`p${i}@${tag}: ` + pts.map(p => `(${p.x},${p.y})`).join(" "));
      }
      fx = fx.GetNext();
    }
    b = b.GetNext(); i++;
  }
  console.log(out.join("\n"));
}

function flipLever(w, idx, dir, label) {
  const lev = w.mechanisms.levers[idx];
  let flipped = -1;
  lev.body.SetGravityScale(0); // 倒摆重力力矩会压过注入速度，探针期禁重力
  for (let f = 0; f < 90; f++) {
    lev.joint.EnableMotor(false);
    lev.body.SetAngularVelocity(dir);
    w.step(DT, idle());
    if (lev.state !== 0 && flipped < 0) {
      flipped = f;
      lev.joint.EnableMotor(true);
      lev.body.SetAngularVelocity(0);
    }
  }
  lev.body.SetGravityScale(1);
  console.log(`${label}: 翻转帧=${flipped} state=${lev.state} angle=${(lev.body.GetAngle() * 180 / Math.PI).toFixed(1)}deg`);
}

function mechLine(w, tag) {
  const m = w.mechSnapshot();
  console.log(`${tag} | levers: ${m.levers.map(l => `l${l.id}(g${l.group},st${l.state},${(l.angle * 180 / Math.PI).toFixed(1)}°)`).join(" ")} | platforms: ${m.platforms.map(p => `p${p.id}(st${p.state},${p.x.toFixed(0)},${p.y.toFixed(0)},${(p.angle * 180 / Math.PI).toFixed(1)}°)`).join(" ")}`);
}

// ---- group 0: l0 → p0, p1
console.log("== group0: 扳 l0 (onis=-1, 需 bodyAngle<0 → dir=-1)");
{
  const w = makeWorld("forest_18");
  for (let f = 0; f < 5; f++) w.step(DT, idle());
  mechLine(w, "f5");
  flipLever(w, 0, -1, "l0");
  for (const f of [30, 60, 90, 120, 180]) {
    for (let i = 0; i < f - (w._a || 0) - 5; i++) w.step(DT, idle());
    w._a = f;
    mechLine(w, `扳后+${f}f`);
  }
  platVerts(w, "group0ON");
  // 回扳
  flipLever(w, 0, +1, "l0回");
  for (let f = 0; f < 180; f++) w.step(DT, idle());
  mechLine(w, "回扳180f");
  platVerts(w, "group0OFF");
}

// ---- group 2: l1 → p4
console.log("\n== group2: 扳 l1 (onis=+1, 需 bodyAngle>0 → dir=+1)");
{
  const w = makeWorld("forest_18");
  for (let f = 0; f < 5; f++) w.step(DT, idle());
  mechLine(w, "f5");
  flipLever(w, 1, +1, "l1");
  for (const f of [30, 60, 90, 120, 180]) {
    for (let i = 0; i < f - (w._b || 0) - 5; i++) w.step(DT, idle());
    w._b = f;
    mechLine(w, `扳后+${f}f`);
  }
  platVerts(w, "group2ON");
  flipLever(w, 1, +1, "l1回");
  for (let f = 0; f < 180; f++) w.step(DT, idle());
  mechLine(w, "回扳180f");
  platVerts(w, "group2OFF");
}

// forest_27 机关运动学探针（模式同 forest_19 probe2 / forest_25 probe2/3）
// 用法：cd TEMP/flashbp27 && node --import tsx probe-f27.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const sx = (b) => +(b.GetPosition().x * -32).toFixed(2);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(2);
const deg = (r) => +(r * 180 / Math.PI).toFixed(2);
const inp = { fireboy: {}, watergirl: {} };

// ---- A. f0 初始态 + 首帧 checkState（0d24592 语义：风入组，l1 应驱动 3 风机；自动翻转核验）----
{
  const w = makeWorld("forest_27");
  const M = w.mechanisms;
  const s0 = () => `levers=[${M.levers.map(l => `g${l.group}:${l.state}/a${deg(l.body.GetAngle())}`).join(" ")}] pushers=[${M.pushers.map(p => `g${p.group}:${p.state}/t${p.joint.GetJointTranslation().toFixed(2)}`)}] platforms=[${M.platforms.map(p => `g${p.group}:${p.state}`).join(" ")}] winds=[${M.winds.map(f => `g${f.group}:${f.state}`).join(" ")}]`;
  console.log("[A] f0 构建后(未step):", s0());
  w.step(1 / 60, inp);
  console.log("[A] step1 后      :", s0());
  for (let i = 0; i < 9; i++) w.step(1 / 60, inp);
  console.log("[A] step10 后     :", s0());
}

// ---- B. 240f idle：静止漂移 + 球落位 + 角色沉降 ----
{
  const w = makeWorld("forest_27");
  const M = w.mechanisms;
  for (let f = 0; f < 240; f++) w.step(1 / 60, inp);
  const ball = M.props[0];
  console.log(`[B] 240f idle: players fb=(${sx(w.chars.fireboy.body)},${sy(w.chars.fireboy.body)}) wg=(${sx(w.chars.watergirl.body)},${sy(w.chars.watergirl.body)})`);
  console.log(`[B]   ball=(${sx(ball.body)},${sy(ball.body)}) levers=[${M.levers.map(l => `${l.state}/a${deg(l.body.GetAngle())}`).join(" ")}] winds=[${M.winds.map(f => f.state).join(" ")}] platforms=[${M.platforms.map(p => `${sx(p.body)},${sy(p.body)},a${deg(p.body.GetAngle())}`).join(" | ")}]`);
}

// ---- C. g0：l0 扭矩扳 ON → p0/p1 旋转平台全行程；再扳 OFF 回程 ----
{
  const w = makeWorld("forest_27");
  const M = w.mechanisms;
  const l0 = M.levers[0], p0 = M.platforms[0], p1 = M.platforms[1];
  const traj = [];
  let flippedAt = -1;
  for (let f = 0; f <= 400 && flippedAt < 0; f++) {
    l0.body.ApplyTorque(-30, true);
    w.step(1 / 60, inp);
    if (l0.state === 1 && f > 0) flippedAt = f;
    if (f % 40 === 0) traj.push(`f${f}: l0=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p0 ja=${deg(p0.joint.GetJointAngleRadians())} @(${sx(p0.body)},${sy(p0.body)},a${deg(p0.body.GetAngle())}) p1 ja=${deg(p1.joint.GetJointAngleRadians())} @(${sx(p1.body)},${sy(p1.body)},a${deg(p1.body.GetAngle())})`);
  }
  traj.push(`flipON @f${flippedAt}`);
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, inp);
    if (f % 20 === 0 || f === 240) traj.push(`on+f${f}: l0=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} motor=${l0.joint.GetMotorSpeed().toFixed(1)} p0 ja=${deg(p0.joint.GetJointAngleRadians())} @(${sx(p0.body)},${sy(p0.body)},a${deg(p0.body.GetAngle())}) p1 ja=${deg(p1.joint.GetJointAngleRadians())} @(${sx(p1.body)},${sy(p1.body)},a${deg(p1.body.GetAngle())})`);
  }
  console.log("[C] l0 扳ON(-30扭矩):\n  " + traj.join("\n  "));
  // p0 终位碰撞盒（旋转后）
  const rectOf = (body) => {
    let fx = body.GetFixtureList(); const pts = [];
    while (fx) { if (fx.GetShape().m_vertices) for (const q of fx.GetShape().m_vertices.slice(0, 4)) { const c = Math.cos(body.GetAngle()), s = Math.sin(body.GetAngle()); pts.push([+((body.GetPosition().x + c * q.x - s * q.y) * -32).toFixed(1), +((body.GetPosition().y + s * q.x + c * q.y) * -32).toFixed(1)]); } fx = fx.GetNext(); }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return `(${Math.min(...xs)}-${Math.max(...xs)}, ${Math.min(...ys)}-${Math.max(...ys)})`;
  };
  console.log(`[C] ON 终位 p0 rect=${rectOf(p0.body)}  p1 rect=${rectOf(p1.body)}`);
  // 扳回 OFF
  const traj2 = [];
  let offAt = -1;
  for (let f = 0; f <= 400 && offAt < 0; f++) {
    l0.body.ApplyTorque(30, true);
    w.step(1 / 60, inp);
    if (l0.state === 0 && f > 0) offAt = f;
  }
  for (let f = 0; f <= 160; f++) {
    w.step(1 / 60, inp);
    if (f % 40 === 0) traj2.push(`off+f${f}: l0=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p0 ja=${deg(p0.joint.GetJointAngleRadians())} @(${sx(p0.body)},${sy(p0.body)}) p1 ja=${deg(p1.joint.GetJointAngleRadians())} @(${sx(p1.body)},${sy(p1.body)})`);
  }
  console.log(`[C] l0 扳回OFF(+30) @f${offAt}:\n  ` + traj2.join("\n  "));
}

// ---- D. g4：l1 扳 ON → 3 风机跟随；fb 传送入 f2 风柱实测推力/阻尼；OFF 对照 ----
{
  const flip = (w) => {
    const M = w.mechanisms;
    for (let f = 0; f <= 400; f++) {
      M.levers[1].body.ApplyTorque(-30, true);
      w.step(1 / 60, inp);
      if (M.levers[1].state === 1) return f;
    }
    return -1;
  };
  const teleport = (w, role, x, y) => {
    const b = w.chars[role].body;
    const Vec2 = b.GetPosition().constructor;
    b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
    b.SetLinearVelocity(new Vec2(0, 0));
    b.SetAwake(true);
  };
  // D1: 风 ON，fb 入 f2 柱 (208,450)
  {
    const w = makeWorld("forest_27");
    const M = w.mechanisms;
    const at = flip(w);
    console.log(`[D1] l1 扳ON @f${at}: winds=[${M.winds.map(f => f.state).join(" ")}]（g4 三风机跟随实测）`);
    teleport(w, "fireboy", 208, 450);
    const traj = [];
    for (let f = 0; f <= 90; f++) {
      w.step(1 / 60, inp);
      if (f % 15 === 0) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) vy=${p.vy.toFixed(1)} dead=${p.dead}`); }
    }
    console.log("[D1] fb 传送入 f2 柱(208,450) 风 ON:\n  " + traj.join("\n  "));
  }
  // D2: 风 OFF 对照（不扳杆）
  {
    const w = makeWorld("forest_27");
    const M = w.mechanisms;
    console.log(`[D2] 不扳杆: winds=[${M.winds.map(f => f.state).join(" ")}]`);
    teleport(w, "fireboy", 208, 450);
    const traj = [];
    for (let f = 0; f <= 45; f++) {
      w.step(1 / 60, inp);
      if (f % 15 === 0) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) vy=${p.vy.toFixed(1)}`); }
    }
    console.log("[D2] fb 同点位 风 OFF:\n  " + traj.join("\n  "));
  }
  // D3: 扳回 OFF 后风是否停
  {
    const w = makeWorld("forest_27");
    const M = w.mechanisms;
    flip(w);
    let offAt = -1;
    for (let f = 0; f <= 400 && offAt < 0; f++) {
      M.levers[1].body.ApplyTorque(30, true);
      w.step(1 / 60, inp);
      if (M.levers[1].state === 0 && f > 0) offAt = f;
    }
    teleport(w, "fireboy", 208, 450);
    for (let f = 0; f <= 30; f++) w.step(1 / 60, inp);
    const p = w.snapshotPlayer("fireboy");
    console.log(`[D3] l1 扳回OFF @f${offAt}: winds=[${M.winds.map(x => x.state).join(" ")}] fb 30f 后=(${p.x.toFixed(1)},${p.y.toFixed(1)}) vy=${p.vy.toFixed(1)}（应近自由落体 ~500）`);
  }
}

// ---- E. g3：压 b0 → p2 平移平台行程（dy=-3，预期 ON 位移 = -32*(0,-3)=(0,+96) 屏幕向下）----
{
  const w = makeWorld("forest_27");
  const M = w.mechanisms;
  const b0 = M.pushers[0], p2 = M.platforms[2];
  const Vec2 = b0.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 200 && onAt < 0; f++) {
    b0.body.ApplyForce(new Vec2(0, -60), b0.body.GetPosition());
    w.step(1 / 60, inp);
    if (b0.state === 1 && f > 0) onAt = f;
    if (f % 20 === 0) traj.push(`f${f}: b0 t=${b0.joint.GetJointTranslation().toFixed(3)} state=${b0.state} p2 @(${sx(p2.body)},${sy(p2.body)})`);
  }
  traj.push(`b0 ON @f${onAt}`);
  for (let f = 0; f <= 100; f++) {
    b0.body.ApplyForce(new Vec2(0, -60), b0.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 20 === 0) traj.push(`hold f${f}: b0 t=${b0.joint.GetJointTranslation().toFixed(3)} state=${b0.state} p2 @(${sx(p2.body)},${sy(p2.body)})`);
  }
  console.log("[E] 压 b0（-60 b2 力 = 屏幕向下）:\n  " + traj.join("\n  "));
  const traj2 = [];
  for (let f = 0; f <= 100; f++) {
    w.step(1 / 60, inp);
    if (f % 20 === 0) traj2.push(`rel f${f}: b0 t=${b0.joint.GetJointTranslation().toFixed(3)} state=${b0.state} p2 @(${sx(p2.body)},${sy(p2.body)})`);
  }
  console.log("[E] 离手回弹:\n  " + traj2.join("\n  "));
}

// ---- F. 岩浆致死实测（27 新液种：type6 只杀 wg / fb 免疫，character.ts liquidTouched）----
function lavaTest(label, role, x, y) {
  const w = makeWorld("forest_27");
  const b = w.chars[role].body;
  const Vec2 = b.GetPosition().constructor;
  b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(new Vec2(0, 0));
  b.SetAwake(true);
  const traj = [];
  for (let f = 0; f <= 200; f++) {
    w.step(1 / 60, inp);
    if (f % 40 === 0 || f === 1) { const p = w.snapshotPlayer(role); traj.push(`f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} dying=${p.dying} inLiq=${p.inLiquid} phase=${w.phase}`); }
    if (w.phase === "gameover") { const p = w.snapshotPlayer(role); traj.push(`f${f}: gameover (${p.x.toFixed(1)},${p.y.toFixed(1)})`); break; }
  }
  console.log(`[F] ${label} ${role} @(${x},${y}):\n  ` + traj.join("\n  "));
}
lavaTest("F1 底西池面(272,830) surface864", "watergirl", 272, 830);
lavaTest("F2 底西池面(272,830)", "fireboy", 272, 830);
lavaTest("F3 东上带池A(784,160) surface192", "watergirl", 784, 160);
console.log("done");

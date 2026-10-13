// forest_29 机关运动学探针（模式同 forest_27 probe-f27 / forest_19 probe2）
// A f0+首帧自动翻转；B 240f idle 沉降；C 杠杆 ON→id7/id9 全行程→OFF；
// D 压 b_id12→id10；E 压 b_id13→id14；F 滑轮三连（推箱/板2载人/板1载人）；G 液体致死 6 连；H 银钻拾取
// 用法：cd TEMP/flashbp29 && node --import tsx probe-f29.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const sx = (b) => +(b.GetPosition().x * -32).toFixed(2);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(2);
const deg = (r) => +(r * 180 / Math.PI).toFixed(2);
const inp = { fireboy: {}, watergirl: {} };
const teleport = (w, role, x, y) => {
  const b = w.chars[role].body;
  const Vec2 = b.GetPosition().constructor;
  b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(new Vec2(0, 0));
  b.SetAwake(true);
};
const rectOf = (body) => {
  let fx = body.GetFixtureList(); const pts = [];
  while (fx) { if (fx.GetShape().m_vertices) for (const q of fx.GetShape().m_vertices.slice(0, 4)) { const c = Math.cos(body.GetAngle()), s = Math.sin(body.GetAngle()); pts.push([+((body.GetPosition().x + c * q.x - s * q.y) * -32).toFixed(1), +((body.GetPosition().y + s * q.x + c * q.y) * -32).toFixed(1)]); } fx = fx.GetNext(); }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return `x[${Math.min(...xs)},${Math.max(...xs)}] y[${Math.min(...ys)},${Math.max(...ys)}]`;
};
const snap = (w) => {
  const M = w.mechanisms;
  return `lever=[${M.levers.map(l => `g${l.group}:${l.state}/ja${deg(l.joint.GetJointAngleRadians())}`).join(",")}] ` +
    `pushers=[${M.pushers.map(p => `g${p.group}:${p.state}/t${p.joint.GetJointTranslation().toFixed(3)}`).join(",")}] ` +
    `plats=[${M.platforms.map(p => `${sy(p.body)}`).join(",")}] ` +
    `pulley=[${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}|${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)}] ` +
    `box=(${sx(M.props[0].body)},${sy(M.props[0].body)}) ball=(${sx(M.props[1].body)},${sy(M.props[1].body)})`;
};

// ---- A. f0 初始态 + 首帧 checkState（自动翻转核验）----
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  console.log("[A] f0 构建后(未step):", snap(w));
  w.step(1 / 60, inp);
  console.log("[A] step1 后        :", snap(w));
  for (let i = 0; i < 9; i++) w.step(1 / 60, inp);
  console.log("[A] step10 后       :", snap(w));
}

// ---- B. 240f idle：沉降全家福 ----
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  const marks = [0, 1, 5, 20, 60, 120, 180, 239];
  for (let f = 0; f < 240; f++) { w.step(1 / 60, inp); if (marks.includes(f)) console.log(`[B] f${f}:`, snap(w)); }
  const [fb, wg] = [w.snapshotPlayer("fireboy"), w.snapshotPlayer("watergirl")];
  console.log(`[B] 240f players: fb=(${fb.x},${fb.y}) wg=(${wg.x},${wg.y})`);
  console.log(`[B] 240f plat rects: p_id7 ${rectOf(M.platforms[0].body)} | p_id9 ${rectOf(M.platforms[1].body)} | p_id10 ${rectOf(M.platforms[2].body)} | p_id14 ${rectOf(M.platforms[3].body)}`);
}

// ---- C. g2：杠杆扳 ON → id7/id9 全行程；再 OFF 回程 ----
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  const l0 = M.levers[0], p7 = M.platforms[0], p9 = M.platforms[1];
  const traj = [];
  let flippedAt = -1, dirUsed = "?";
  // 先试 +30（b2 扭矩），200f 内不翻再试 −30
  for (let f = 0; f <= 200 && flippedAt < 0; f++) {
    l0.body.ApplyTorque(30, true);
    w.step(1 / 60, inp);
    if (l0.state === 1 && f > 0) { flippedAt = f; dirUsed = "+30"; }
  }
  if (flippedAt < 0) {
    for (let f = 0; f <= 200 && flippedAt < 0; f++) {
      l0.body.ApplyTorque(-30, true);
      w.step(1 / 60, inp);
      if (l0.state === 1 && f > 0) { flippedAt = f; dirUsed = "-30"; }
    }
  }
  traj.push(`flipON torque=${dirUsed} @f${flippedAt}`);
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj.push(`on+f${f}: lever=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p7@(${sx(p7.body)},${sy(p7.body)}) p9@(${sx(p9.body)},${sy(p9.body)})`);
  }
  traj.push(`ON 终位 p7 ${rectOf(p7.body)} | p9 ${rectOf(p9.body)}`);
  console.log("[C] 杠杆 ON:\n  " + traj.join("\n  "));
  // 扳回 OFF
  const traj2 = [];
  const backDir = dirUsed === "+30" ? -30 : 30;
  let offAt = -1;
  for (let f = 0; f <= 300 && offAt < 0; f++) {
    l0.body.ApplyTorque(backDir, true);
    w.step(1 / 60, inp);
    if (l0.state === 0 && f > 0) offAt = f;
  }
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj2.push(`off+f${f}: lever=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p7@(${sx(p7.body)},${sy(p7.body)}) p9@(${sx(p9.body)},${sy(p9.body)})`);
  }
  traj2.push(`OFF 回位 p7 ${rectOf(p7.body)} | p9 ${rectOf(p9.body)}`);
  console.log(`[C] 杠杆 OFF(扭矩${backDir}) @f${offAt}:\n  ` + traj2.join("\n  "));
}

// ---- D. g5：压推块 id12 → id10 行程；离手回弹 ----
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  const b12 = M.pushers[0], p10 = M.platforms[2];
  const Vec2 = b12.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 300 && onAt < 0; f++) {
    b12.body.ApplyForce(new Vec2(0, -60), b12.body.GetPosition());
    w.step(1 / 60, inp);
    if (b12.state === 1 && f > 0) onAt = f;
    if (f % 30 === 0) traj.push(`f${f}: b12 t=${b12.joint.GetJointTranslation().toFixed(3)} state=${b12.state} p10@(${sx(p10.body)},${sy(p10.body)})`);
  }
  traj.push(`b12 ON @f${onAt}`);
  for (let f = 0; f <= 240; f++) {
    b12.body.ApplyForce(new Vec2(0, -60), b12.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0) traj.push(`hold f${f}: b12 t=${b12.joint.GetJointTranslation().toFixed(3)} state=${b12.state} p10@(${sx(p10.body)},${sy(p10.body)})`);
  }
  traj.push(`hold 末 p10 ${rectOf(p10.body)}`);
  console.log("[D] 压 b12(g5)（b2 力(0,-60)=屏幕向下）:\n  " + traj.join("\n  "));
  const traj2 = [];
  for (let f = 0; f <= 180; f++) {
    w.step(1 / 60, inp);
    if (f % 30 === 0) traj2.push(`rel f${f}: b12 t=${b12.joint.GetJointTranslation().toFixed(3)} state=${b12.state} p10@(${sx(p10.body)},${sy(p10.body)})`);
  }
  traj2.push(`回弹末 p10 ${rectOf(p10.body)}`);
  console.log("[D] 离手回弹:\n  " + traj2.join("\n  "));
}

// ---- E. g0：压推块 id13 → id14（预期行程受阻/死台）----
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  const b13 = M.pushers[1], p14 = M.platforms[3];
  const Vec2 = b13.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 300 && onAt < 0; f++) {
    b13.body.ApplyForce(new Vec2(0, -60), b13.body.GetPosition());
    w.step(1 / 60, inp);
    if (b13.state === 1 && f > 0) onAt = f;
    if (f % 30 === 0) traj.push(`f${f}: b13 t=${b13.joint.GetJointTranslation().toFixed(3)} state=${b13.state} p14@(${sx(p14.body)},${sy(p14.body)})`);
  }
  traj.push(`b13 ON @f${onAt}`);
  for (let f = 0; f <= 240; f++) {
    b13.body.ApplyForce(new Vec2(0, -60), b13.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0) traj.push(`hold f${f}: b13 t=${b13.joint.GetJointTranslation().toFixed(3)} state=${b13.state} p14@(${sx(p14.body)},${sy(p14.body)})`);
  }
  traj.push(`hold 末 p14 ${rectOf(p14.body)}`);
  console.log("[E] 压 b13(g0):\n  " + traj.join("\n  "));
  const traj2 = [];
  for (let f = 0; f <= 180; f++) {
    w.step(1 / 60, inp);
    if (f % 30 === 0) traj2.push(`rel f${f}: b13 t=${b13.joint.GetJointTranslation().toFixed(3)} state=${b13.state} p14@(${sx(p14.body)},${sy(p14.body)})`);
  }
  console.log("[E] 离手回弹:\n  " + traj2.join("\n  "));
}

// ---- F. 滑轮三连 ----
// F1: 把箱子推离板1（b2 力 (+60,0) = 屏幕向左）→ 板再平衡
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp); // 先让 f0 沉降
  const box = M.props[0].body, Vec2 = box.GetPosition().constructor;
  const traj = [];
  for (let f = 0; f <= 300; f++) {
    box.ApplyForce(new Vec2(60, 0), box.GetPosition());
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj.push(`f${f}: box=(${sx(box)},${sy(box)}) plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`);
  }
  console.log("[F1] 推箱离板1（向左）:\n  " + traj.join("\n  "));
}
// F2: 传送 wg 上板2 → 板2 沉降 / 板1 升（测 1:1 行程与端点）
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  teleport(w, "watergirl", 560, 700);
  const traj = [];
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 40 === 0 || f === 300) { const p = w.snapshotPlayer("watergirl"); traj.push(`f${f}: wg=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  console.log("[F2] wg 上板2(560,700):\n  " + traj.join("\n  "));
}
// F3: 传送 fb 上板1（含箱）→ 板1 已沉降，微动核验
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  teleport(w, "fireboy", 368, 508);
  const traj = [];
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, inp);
    if (f % 40 === 0 || f === 240) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  console.log("[F3] fb 上板1(368,508):\n  " + traj.join("\n  "));
}

// ---- G. 液体致死 6+2 连（water7 / green23 / lava27W / 悬空水带 row12）----
function liquidTest(label, role, x, y) {
  const w = makeWorld("forest_29");
  teleport(w, role, x, y);
  const traj = [];
  for (let f = 0; f <= 200; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 1) { const p = w.snapshotPlayer(role); traj.push(`f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} inLiq=${p.inLiquid} phase=${w.phase}`); }
    if (w.phase === "gameover") { traj.push(`f${f}: gameover`); break; }
  }
  console.log(`[G] ${label} ${role} @(${x},${y}):\n  ` + traj.join("\n  "));
}
liquidTest("G1 水池row7(304,240)", "fireboy", 304, 240);
liquidTest("G2 水池row7(304,240)", "watergirl", 304, 240);
liquidTest("G3 绿池row23(208,752)", "fireboy", 208, 752);
liquidTest("G4 绿池row23(208,752)", "watergirl", 208, 752);
liquidTest("G5 岩浆W(832,880)", "watergirl", 832, 880);
liquidTest("G6 岩浆W(832,880)", "fireboy", 832, 880);
liquidTest("G7 悬空水槽row12(176,404)槽底", "fireboy", 176, 404);
liquidTest("G8 悬空水槽row12(176,404)槽底", "watergirl", 176, 404);

// ---- H. 银钻拾取（wg 直接 / fb 顺落）----
{
  const w = makeWorld("forest_29");
  teleport(w, "watergirl", 864, 596);
  let evs = [];
  for (let f = 0; f <= 120; f++) { evs = evs.concat(w.step(1 / 60, inp)); if (f % 40 === 0) { const p = w.snapshotPlayer("watergirl"); console.log(`[H] wg@(864,596) f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} diamonds=${JSON.stringify(w.diamonds.map(d => d.collected))} ev=${JSON.stringify(evs.filter(e => e.type === "diamond" || e.type === "death"))}`); evs = []; } }
}
{
  const w = makeWorld("forest_29");
  teleport(w, "fireboy", 864, 596);
  let evs = [];
  for (let f = 0; f <= 120; f++) { evs = evs.concat(w.step(1 / 60, inp)); if (f % 40 === 0) { const p = w.snapshotPlayer("fireboy"); console.log(`[H] fb@(864,596) f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} diamonds=${JSON.stringify(w.diamonds.map(d => d.collected))} ev=${JSON.stringify(evs.filter(e => e.type === "diamond" || e.type === "death"))}`); evs = []; } }
}
console.log("done");

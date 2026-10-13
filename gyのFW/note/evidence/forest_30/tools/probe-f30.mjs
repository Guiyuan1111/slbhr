// forest_30 机关运动学探针（模式同 forest_29 probe-f29）
// A f0+首帧自动翻转核验；B 240f idle 沉降；C 压 b0(g0)→p0 旋转墙；D 压 b1(g1)→p1 旋转墙；
// E 杠杆 l0(g3) ON→p2 闸门升→OFF 回程；F 滑轮三连（移箱/板2载人/板1载人）；G 液体致死 8 连；H 钻石拾取
// 用法：cd TEMP/flashbp30 && node --import tsx probe-f30.mjs
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
const platJa = (p) => { try { return `ja${deg(p.joint.GetJointAngleRadians())}`; } catch { return ""; } };
const snap = (w) => {
  const M = w.mechanisms;
  return `lever=[${M.levers.map(l => `g${l.group}:${l.state}/ja${deg(l.joint.GetJointAngleRadians())}`).join(",")}] ` +
    `pushers=[${M.pushers.map(p => `g${p.group}:${p.state}/t${p.joint.GetJointTranslation().toFixed(3)}`).join(",")}] ` +
    `plats=[${M.platforms.map(p => `(${sx(p.body)},${sy(p.body)},a${deg(p.body.GetAngle())}${p.isRevolute ? "," + platJa(p) : ""})`).join(" ")}] ` +
    `pulley=[(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)})|(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})] ` +
    `boxes=[${M.props.map(p => `(${sx(p.body)},${sy(p.body)})`).join(" ")}]`;
};

// ---- A. f0 初始态 + 首帧 checkState（自动翻转核验）----
{
  const w = makeWorld("forest_30");
  console.log("[A] f0 构建后(未step):", snap(w));
  w.step(1 / 60, inp);
  console.log("[A] step1 后        :", snap(w));
  for (let i = 0; i < 9; i++) w.step(1 / 60, inp);
  console.log("[A] step10 后       :", snap(w));
}

// ---- B. 240f idle：沉降全家福 ----
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  const marks = [0, 1, 5, 20, 60, 120, 180, 239];
  for (let f = 0; f < 240; f++) { w.step(1 / 60, inp); if (marks.includes(f)) console.log(`[B] f${f}:`, snap(w)); }
  const [fb, wg] = [w.snapshotPlayer("fireboy"), w.snapshotPlayer("watergirl")];
  console.log(`[B] 240f players: fb=(${fb.x},${fb.y}) wg=(${wg.x},${wg.y})`);
  console.log(`[B] 240f plat rects: p0 ${rectOf(M.platforms[0].body)} | p1 ${rectOf(M.platforms[1].body)} | p2 ${rectOf(M.platforms[2].body)}`);
}

// ---- C. g0：压推块 b0 → p0 旋转墙（dtheta=90）全行程；离手回转 ----
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  const b0 = M.pushers[0], p0 = M.platforms[0];
  const Vec2 = b0.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 300 && onAt < 0; f++) {
    b0.body.ApplyForce(new Vec2(0, -60), b0.body.GetPosition());
    w.step(1 / 60, inp);
    if (b0.state === 1 && f > 0) onAt = f;
    if (f % 20 === 0) traj.push(`f${f}: b0 t=${b0.joint.GetJointTranslation().toFixed(3)} st=${b0.state} p0 a=${deg(p0.body.GetAngle())}${platJa(p0)} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj.push(`b0 ON @f${onAt}`);
  for (let f = 0; f <= 240; f++) {
    b0.body.ApplyForce(new Vec2(0, -60), b0.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj.push(`hold f${f}: p0 a=${deg(p0.body.GetAngle())}${platJa(p0)} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj.push(`hold 末 p0 ${rectOf(p0.body)} ja=${platJa(p0)}`);
  console.log("[C] 压 b0(g0)→p0 旋转:\n  " + traj.join("\n  "));
  const traj2 = [];
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj2.push(`rel f${f}: b0 st=${b0.state}/t=${b0.joint.GetJointTranslation().toFixed(3)} p0 a=${deg(p0.body.GetAngle())} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj2.push(`回转末 p0 ${rectOf(p0.body)}`);
  console.log("[C] 离手回转:\n  " + traj2.join("\n  "));
}

// ---- D. g1：压推块 b1 → p1 旋转墙 ----
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  const b1 = M.pushers[1], p1 = M.platforms[1];
  const Vec2 = b1.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 300 && onAt < 0; f++) {
    b1.body.ApplyForce(new Vec2(0, -60), b1.body.GetPosition());
    w.step(1 / 60, inp);
    if (b1.state === 1 && f > 0) onAt = f;
  }
  for (let f = 0; f <= 240; f++) {
    b1.body.ApplyForce(new Vec2(0, -60), b1.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj.push(`hold f${f}: b1 st=${b1.state} p1 a=${deg(p1.body.GetAngle())} @(${sx(p1.body)},${sy(p1.body)})`);
  }
  traj.push(`b1 ON @f${onAt}; hold 末 p1 ${rectOf(p1.body)}`);
  console.log("[D] 压 b1(g1)→p1 旋转:\n  " + traj.join("\n  "));
}

// ---- E. g3：杠杆 l0 扳 ON → p2 闸门升 128px；扳回 OFF ----
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  const l0 = M.levers[0], p2 = M.platforms[2];
  const traj = [];
  let flippedAt = -1, dirUsed = "?";
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
    if (f % 50 === 0 || f === 300) traj.push(`on+f${f}: lever=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p2@(${sx(p2.body)},${sy(p2.body)})`);
  }
  traj.push(`ON 终位 p2 ${rectOf(p2.body)}`);
  console.log("[E] 杠杆 ON:\n  " + traj.join("\n  "));
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
    if (f % 50 === 0 || f === 300) traj2.push(`off+f${f}: lever=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p2@(${sx(p2.body)},${sy(p2.body)})`);
  }
  traj2.push(`OFF 回位 p2 ${rectOf(p2.body)}`);
  console.log(`[E] 杠杆 OFF(扭矩${backDir}) @f${offAt}:\n  ` + traj2.join("\n  "));
}

// ---- F. 滑轮三连 ----
// F1: 先 240f 沉降（箱压板1），再把箱子 x1 传走 → 中性锁存核验
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 240; f++) w.step(1 / 60, inp);
  console.log(`[F1] 沉降后: pulley=[(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)})|(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})] box1=(${sx(M.props[1].body)},${sy(M.props[1].body)})`);
  const box = M.props[1].body;
  teleport(w, "fireboy", 200, 100); // 借用 teleport 函数体不变，箱子单独处理
  const Vec2 = box.GetPosition().constructor;
  box.SetTransformVecRadians(new Vec2(-200 / 32, -100 / 32), 0);
  box.SetLinearVelocity(new Vec2(0, 0));
  box.SetAwake(true);
  const traj = [];
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj.push(`f${f}: box1=(${sx(box)},${sy(box)}) plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`);
  }
  console.log("[F1] 箱传走(200,100)后 240f:\n  " + traj.join("\n  "));
}
// F2: 箱移走后 wg 上板2 → 板2 沉到 r24 台顶 / 板1 1:1 升
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 240; f++) w.step(1 / 60, inp);
  const box = M.props[1].body, Vec2 = box.GetPosition().constructor;
  box.SetTransformVecRadians(new Vec2(-200 / 32, -100 / 32), 0);
  box.SetLinearVelocity(new Vec2(0, 0)); box.SetAwake(true);
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  teleport(w, "watergirl", 720, 560);
  const traj = [];
  for (let f = 0; f <= 480; f++) {
    w.step(1 / 60, inp);
    if (f % 80 === 0 || f === 480) { const p = w.snapshotPlayer("watergirl"); traj.push(`f${f}: wg=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  console.log("[F2] wg 上板2(720,560):\n  " + traj.join("\n  "));
}
// F3: 箱移走后 fb 上板1 → 板1 微降坐 r19 块顶 / 板2 升至桥位
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 240; f++) w.step(1 / 60, inp);
  const box = M.props[1].body, Vec2 = box.GetPosition().constructor;
  box.SetTransformVecRadians(new Vec2(-200 / 32, -100 / 32), 0);
  box.SetLinearVelocity(new Vec2(0, 0)); box.SetAwake(true);
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  teleport(w, "fireboy", 336, 560);
  const traj = [];
  for (let f = 0; f <= 480; f++) {
    w.step(1 / 60, inp);
    if (f % 80 === 0 || f === 480) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  console.log("[F3] fb 上板1(336,560):\n  " + traj.join("\n  "));
}
// F4: 不移箱，fb 直接上板2 → 板1 侧恒重，板2 应压不动（随遇锁存对照）
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 240; f++) w.step(1 / 60, inp);
  teleport(w, "fireboy", 720, 560);
  const traj = [];
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 100 === 0 || f === 300) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  console.log("[F4] 有箱 fb 上板2:\n  " + traj.join("\n  "));
}

// ---- G. 液体致死 8 连 ----
function liquidTest(label, role, x, y) {
  const w = makeWorld("forest_30");
  teleport(w, role, x, y);
  const traj = [];
  for (let f = 0; f <= 200; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 1) { const p = w.snapshotPlayer(role); traj.push(`f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} inLiq=${p.inLiquid} phase=${w.phase}`); }
    if (w.phase === "gameover") { traj.push(`f${f}: gameover`); break; }
  }
  console.log(`[G] ${label} ${role} @(${x},${y}):\n  ` + traj.join("\n  "));
}
liquidTest("G1 W1水池row6", "fireboy", 384, 208);
liquidTest("G2 W1水池row6", "watergirl", 384, 208);
liquidTest("G3 L1岩浆row6", "watergirl", 928, 208);
liquidTest("G4 L1岩浆row6", "fireboy", 928, 208);
liquidTest("G5 W2水池row11", "fireboy", 112, 368);
liquidTest("G6 W2水池row11", "watergirl", 112, 368);
liquidTest("G7 W3水池row23", "fireboy", 928, 752);
liquidTest("G8 W3水池row23", "watergirl", 928, 752);

// ---- H. 钻石拾取（蓝 d0 / 红 d4 / 蓝 d2 水面上空 / 红 d6 岩浆上空）----
function diamondTest(label, role, x, y) {
  const w = makeWorld("forest_30");
  teleport(w, role, x, y);
  let evs = [];
  for (let f = 0; f <= 100; f++) {
    evs = evs.concat(w.step(1 / 60, inp));
    const p = w.snapshotPlayer(role);
    if (f % 50 === 0 || p.dead || w.phase === "gameover") {
      console.log(`[H] ${label} ${role}@(${x},${y}) f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} collected=${JSON.stringify(w.diamonds.map(d => d.collected))} ev=${JSON.stringify(evs.filter(e => e.type === "diamond" || e.type === "death"))}`);
      evs = [];
      if (p.dead || w.phase === "gameover") break;
    }
  }
}
diamondTest("H1 蓝d0", "watergirl", 320, 150);
diamondTest("H2 红d4", "fireboy", 864, 150);
diamondTest("H3 蓝d2(W2上空)", "watergirl", 112, 308);
diamondTest("H4 红d6(L2上空)", "fireboy", 1072, 308);
console.log("done");

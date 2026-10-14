// forest_31 机关运动学探针（模式同 forest_30 probe-f30）
// A f0+首帧自动翻转核验；B 240f idle 沉降；C 压 b1(西,g0)→p0 旋转墙全行程+离手回转；
// D 压 b0(东,g0)→同平台验证；E 杠杆 l0(g1,onis=-1) ON→p_id31 东移；F 杠杆 l1(g3) ON→p_id27 西移；
// G 液体 10 段×2 角色致死矩阵（正确姿势=带面上方落入）；H 钻石 14 颗拾取；I 双门 win 链；
// J p0-ON 后底层通道静立核验；K 真实输入链（fb 站上 b1 沉降触发 g0）
// 用法：cd TEMP/flashbp31 && node --import tsx probe-f31.mjs
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
    `plats=[${M.platforms.map(p => `(${sx(p.body)},${sy(p.body)},a${deg(p.body.GetAngle())}${p.isRevolute ? "," + platJa(p) : ""})`).join(" ")}]`;
};

// ---- A. f0 初始态 + 首帧 checkState（自动翻转核验：onis=-1/startPos=+1 镜像型）----
{
  const w = makeWorld("forest_31");
  console.log("[A] f0 构建后(未step):", snap(w));
  w.step(1 / 60, inp);
  console.log("[A] step1 后        :", snap(w));
  for (let i = 0; i < 9; i++) w.step(1 / 60, inp);
  console.log("[A] step10 后       :", snap(w));
}

// ---- B. 240f idle：沉降全家福 ----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const marks = [0, 1, 5, 20, 60, 120, 239];
  for (let f = 0; f < 240; f++) { w.step(1 / 60, inp); if (marks.includes(f)) console.log(`[B] f${f}:`, snap(w)); }
  const [fb, wg] = [w.snapshotPlayer("fireboy"), w.snapshotPlayer("watergirl")];
  console.log(`[B] 240f players: fb=(${fb.x},${fb.y}) wg=(${wg.x},${wg.y})`);
  console.log(`[B] 240f plat rects: p_rot ${rectOf(M.platforms[0].body)} | p_g3 ${rectOf(M.platforms[1].body)} | p_g1 ${rectOf(M.platforms[2].body)}`);
  console.log(`[B] 240f lever rods: l_g1 ${rectOf(M.levers[0].body)} a=${deg(M.levers[0].body.GetAngle())} | l_g3 ${rectOf(M.levers[1].body)} a=${deg(M.levers[1].body.GetAngle())}`);
}

// ---- C. 压推块 b1（pushers[1]，西侧 (640,896)）→ p0 旋转墙全行程；离手回转 ----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const b1 = M.pushers[1], p0 = M.platforms[0];
  const Vec2 = b1.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 300 && onAt < 0; f++) {
    b1.body.ApplyForce(new Vec2(0, -60), b1.body.GetPosition());
    w.step(1 / 60, inp);
    if (b1.state === 1 && f > 0) onAt = f;
    if (f % 20 === 0) traj.push(`f${f}: b1 t=${b1.joint.GetJointTranslation().toFixed(3)} st=${b1.state} p0 a=${deg(p0.body.GetAngle())}${platJa(p0)} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj.push(`b1 ON @f${onAt}`);
  for (let f = 0; f <= 240; f++) {
    b1.body.ApplyForce(new Vec2(0, -60), b1.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj.push(`hold f${f}: p0 a=${deg(p0.body.GetAngle())}${platJa(p0)} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj.push(`hold 末 p0 ${rectOf(p0.body)} ja=${platJa(p0)}`);
  console.log("[C] 压 b1(g0)→p0 旋转:\n  " + traj.join("\n  "));
  const traj2 = [];
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj2.push(`rel f${f}: b1 st=${b1.state}/t=${b1.joint.GetJointTranslation().toFixed(3)} p0 a=${deg(p0.body.GetAngle())} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj2.push(`回转末 p0 ${rectOf(p0.body)}`);
  console.log("[C] 离手回转:\n  " + traj2.join("\n  "));
}

// ---- D. 压推块 b0（pushers[0]，东侧 (1184,896)）→ 同一 g0 平台 ----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const b0 = M.pushers[0], p0 = M.platforms[0];
  const Vec2 = b0.body.GetPosition().constructor;
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 300 && onAt < 0; f++) {
    b0.body.ApplyForce(new Vec2(0, -60), b0.body.GetPosition());
    w.step(1 / 60, inp);
    if (b0.state === 1 && f > 0) onAt = f;
  }
  for (let f = 0; f <= 240; f++) {
    b0.body.ApplyForce(new Vec2(0, -60), b0.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 240) traj.push(`hold f${f}: b0 st=${b0.state} p0 a=${deg(p0.body.GetAngle())} @(${sx(p0.body)},${sy(p0.body)})`);
  }
  traj.push(`b0 ON @f${onAt}; hold 末 p0 ${rectOf(p0.body)}`);
  console.log("[D] 压 b0(g0)→p0 旋转:\n  " + traj.join("\n  "));
}

// ---- E. 杠杆 l0=levers[0]（g1, onis=-1/startPos=+1）ON→p_id31 东移 96px；OFF 回程 ----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const l0 = M.levers[0], p1 = M.platforms[2];
  const traj = [];
  let flippedAt = -1, dirUsed = "?";
  for (const dir of [-30, 30]) {
    for (let f = 0; f <= 200 && flippedAt < 0; f++) {
      l0.body.ApplyTorque(dir, true);
      w.step(1 / 60, inp);
      if (l0.state === 1 && f > 0) { flippedAt = f; dirUsed = dir; }
    }
    if (flippedAt >= 0) break;
  }
  traj.push(`flipON torque=${dirUsed} @f${flippedAt}`);
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj.push(`on+f${f}: lever=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p_g1@(${sx(p1.body)},${sy(p1.body)})`);
  }
  traj.push(`ON 终位 p_g1 ${rectOf(p1.body)}`);
  console.log("[E] 杠杆 l0(g1) ON:\n  " + traj.join("\n  "));
  const traj2 = [];
  const backDir = dirUsed === -30 ? 30 : -30;
  let offAt = -1;
  for (let f = 0; f <= 300 && offAt < 0; f++) {
    l0.body.ApplyTorque(backDir, true);
    w.step(1 / 60, inp);
    if (l0.state === 0 && f > 0) offAt = f;
  }
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj2.push(`off+f${f}: lever=${l0.state}/ja${deg(l0.joint.GetJointAngleRadians())} p_g1@(${sx(p1.body)},${sy(p1.body)})`);
  }
  traj2.push(`OFF 回位 p_g1 ${rectOf(p1.body)}`);
  console.log(`[E] 杠杆 OFF(扭矩${backDir}) @f${offAt}:\n  ` + traj2.join("\n  "));
}

// ---- F. 杠杆 l1=levers[1]（g3）ON→p_id27 西移 96px；OFF 回程 ----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const l1 = M.levers[1], p2 = M.platforms[1];
  const traj = [];
  let flippedAt = -1, dirUsed = "?";
  for (const dir of [-30, 30]) {
    for (let f = 0; f <= 200 && flippedAt < 0; f++) {
      l1.body.ApplyTorque(dir, true);
      w.step(1 / 60, inp);
      if (l1.state === 1 && f > 0) { flippedAt = f; dirUsed = dir; }
    }
    if (flippedAt >= 0) break;
  }
  traj.push(`flipON torque=${dirUsed} @f${flippedAt}`);
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj.push(`on+f${f}: lever=${l1.state}/ja${deg(l1.joint.GetJointAngleRadians())} p_g3@(${sx(p2.body)},${sy(p2.body)})`);
  }
  traj.push(`ON 终位 p_g3 ${rectOf(p2.body)}`);
  console.log("[F] 杠杆 l1(g3) ON:\n  " + traj.join("\n  "));
  const traj2 = [];
  const backDir = dirUsed === -30 ? 30 : -30;
  let offAt = -1;
  for (let f = 0; f <= 300 && offAt < 0; f++) {
    l1.body.ApplyTorque(backDir, true);
    w.step(1 / 60, inp);
    if (l1.state === 0 && f > 0) offAt = f;
  }
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 300) traj2.push(`off+f${f}: lever=${l1.state}/ja${deg(l1.joint.GetJointAngleRadians())} p_g3@(${sx(p2.body)},${sy(p2.body)})`);
  }
  traj2.push(`OFF 回位 p_g3 ${rectOf(p2.body)}`);
  console.log(`[F] 杠杆 OFF(扭矩${backDir}) @f${offAt}:\n  ` + traj2.join("\n  "));
}

// ---- G. 液体 10 段 × 2 角色（正确姿势：传送带面上方 40px 自然落入）----
const RUNS = [
  ["L1 lava r10 c5-9", 240, 330],
  ["W1 water r12 c32-35", 1088, 394],
  ["W2a water r16 c7-9", 272, 522],
  ["W2b water r16 c12-13", 416, 522],
  ["L2 lava r18 c36-37", 1184, 586],
  ["L3 lava r20 c26-27", 864, 650],
  ["L4 lava r23 c7-10", 288, 746],
  ["W3 water r23 c13-16", 480, 746],
  ["G1 green r27 c9-10", 320, 874],
  ["G2 green r27 c14-15", 480, 874],
];
function liquidTest(label, runTop, x, role) {
  const w = makeWorld("forest_31");
  teleport(w, role, x, runTop - 40); // 带面上方 40px
  let firstLiq = -1;
  for (let f = 0; f <= 150; f++) {
    w.step(1 / 60, inp);
    const p = w.snapshotPlayer(role);
    if (p.inLiquid && firstLiq < 0) firstLiq = f;
    if (p.dead || w.phase === "gameover") { console.log(`[G] ${label} ${role}: inLiq@f${firstLiq} DEAD@f${f} pos=(${p.x.toFixed(1)},${p.y.toFixed(1)})`); return; }
    if (f === 150) console.log(`[G] ${label} ${role}: inLiq@f${firstLiq} 存活 150f pos=(${p.x.toFixed(1)},${p.y.toFixed(1)}) inLiq=${p.inLiquid}`);
  }
}
for (const [label, x, topY] of RUNS) {
  liquidTest(label, topY, x, "fireboy");
  liquidTest(label, topY, x, "watergirl");
}

// ---- H. 钻石 14 颗拾取（传送至中心上方 40px 落下穿越）----
const DIA = [
  ["d0 red", "fireboy", 320, 80], ["d1 red", "fireboy", 120, 240], ["d2 red", "fireboy", 272, 440],
  ["d3 red", "fireboy", 544, 368], ["d4 red", "fireboy", 704, 416], ["d5 red", "fireboy", 288, 688],
  ["d6 red", "fireboy", 368, 816], ["d7 blue", "watergirl", 912, 240], ["d8 blue", "watergirl", 832, 432],
  ["d9 blue", "watergirl", 976, 688], ["d10 blue", "watergirl", 712, 664], ["d11 blue", "watergirl", 640, 480],
  ["d12 blue", "watergirl", 480, 688], ["d13 blue", "watergirl", 432, 816],
];
for (const [label, role, x, y] of DIA) {
  const w = makeWorld("forest_31");
  teleport(w, role, x, y - 40);
  let got = -1, evs = [];
  for (let f = 0; f <= 120; f++) {
    evs = evs.concat(w.step(1 / 60, inp));
    const p = w.snapshotPlayer(role);
    const did = label.split(" ")[0];
    const d = w.diamonds.find(dd => dd.id === did);
    if (d?.collected && got < 0) got = f;
    if (got >= 0 || p.dead || f === 120) {
      console.log(`[H] ${label} ${role}@(${x},${y}): got@f${got} dead=${p.dead} pos=(${p.x.toFixed(1)},${p.y.toFixed(1)}) ev=${JSON.stringify(evs.filter(e => e.type === "diamond" || e.type === "death").map(e => e.type))}`);
      break;
    }
  }
}

// ---- I. 双门 win 链（传送两角色进各自门 rect）----
{
  const w = makeWorld("forest_31");
  teleport(w, "fireboy", 992, 860);
  teleport(w, "watergirl", 1088, 860);
  let winF = -1;
  for (let f = 0; f <= 120; f++) {
    const evs = w.step(1 / 60, inp);
    if (w.phase === "won") { winF = f; console.log(`[I] phase=won @f${winF} fbDoor=${JSON.stringify(w.doors.fireboy.isUp)} wgDoor=${JSON.stringify(w.doors.watergirl.isUp)} ev=${JSON.stringify(evs.map(e => e.type))}`); break; }
    if (f % 20 === 0) console.log(`[I] f${f}: fbAt=${w.snapshotPlayer("fireboy").atDoor} wgAt=${w.snapshotPlayer("watergirl").atDoor} fbUp=${w.doors.fireboy.isUp} wgUp=${w.doors.watergirl.isUp}`);
  }
  if (winF < 0) console.log("[I] 120f 未 win！");
}

// ---- J. p0-ON 保持下底层通道静立核验（持续压 b1，fb 传送墙位 (848,868)）----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const b1 = M.pushers[1], p0 = M.platforms[0];
  const Vec2 = b1.body.GetPosition().constructor;
  for (let f = 0; f <= 400; f++) { b1.body.ApplyForce(new Vec2(0, -60), b1.body.GetPosition()); w.step(1 / 60, inp); }
  console.log(`[J] p0-ON: ${rectOf(p0.body)} a=${deg(p0.body.GetAngle())}`);
  teleport(w, "fireboy", 848, 868);
  const traj = [];
  for (let f = 0; f <= 180; f++) {
    b1.body.ApplyForce(new Vec2(0, -60), b1.body.GetPosition());
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 179) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} b1st=${b1.state} p0a=${deg(p0.body.GetAngle())}`); }
  }
  console.log("[J] fb 传送墙位 (848,868) 压住 b1 静立 180f:\n  " + traj.join("\n  "));
  // J2: p0 回程扫掠（松开 b1，fb 滞留墙位）——复位推挤核验
  const w2 = makeWorld("forest_31");
  const M2 = w2.mechanisms;
  const bb = M2.pushers[1], pp = M2.platforms[0];
  const V2 = bb.body.GetPosition().constructor;
  for (let f = 0; f <= 400; f++) { bb.body.ApplyForce(new V2(0, -60), bb.body.GetPosition()); w2.step(1 / 60, inp); }
  teleport(w2, "fireboy", 848, 868);
  for (let f = 0; f < 20; f++) { bb.body.ApplyForce(new V2(0, -60), bb.body.GetPosition()); w2.step(1 / 60, inp); }
  const t2 = [];
  for (let f = 0; f <= 120; f++) {
    w2.step(1 / 60, inp);
    if (f % 30 === 0 || f === 119) { const p = w2.snapshotPlayer("fireboy"); t2.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) p0a=${deg(pp.body.GetAngle())} dead=${p.dead}`); }
  }
  console.log("[J2] 松手后 p0 回转、fb 滞留墙位:\n  " + t2.join("\n  "));
}

// ---- K. 真实输入链：fb 站上 b1 顶面 → 沉降触发 g0（不做外力）----
{
  const w = makeWorld("forest_31");
  const M = w.mechanisms;
  const b1 = M.pushers[1], p0 = M.platforms[0];
  teleport(w, "fireboy", 640, 850); // b1 梯形顶 876.8，fb 体心置于其上方
  const traj = [];
  let onAt = -1;
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, inp);
    const p = w.snapshotPlayer("fireboy");
    if (b1.state === 1 && onAt < 0) onAt = f;
    if (f % 40 === 0 || f === 239) traj.push(`f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) b1t=${b1.joint.GetJointTranslation().toFixed(3)} st=${b1.state} p0ja=${platJa(p0)}`);
  }
  traj.push(`b1 ON @f${onAt}（fb 站踏真实链）`);
  console.log("[K] fb 站 b1:\n  " + traj.join("\n  "));
}
console.log("done");

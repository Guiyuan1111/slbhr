// forest_25 机关运动学探针（模式同 note/evidence/forest_19/tools/probe2.mjs）
// A: step 后 lever 自动翻转 + wind f0 态；B: 240f idle 全家福；
// C: pusher b0(g0) 按压 → platform p0 全行程；D: lever l1(g3) 扳动 → platform p1 堵位判定；
// E: hanging 扰动摆动；F: wind ON/OFF A/B（fb 走落风柱轨迹对照）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const sy = (b) => +(b.GetPosition().y * -32).toFixed(2);
const sx = (b) => +(b.GetPosition().x * -32).toFixed(2);
const snapLever = (l) => `g${l.group} state=${l.state} ja=${(l.joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)}deg`;
const snapWind = (w0) => `g${w0.group} state=${w0.state}`;
const snapPlat = (p) => `g${p.group} ${sx(p.body)},${sy(p.body)}`;

// ---- A. 首帧自动翻转 ----
{
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  console.log("[A] before any step: l0(" + snapLever(M.levers[0]) + ") l1(" + snapLever(M.levers[1]) + ") wind(" + snapWind(M.winds[0]) + ")");
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
  console.log("[A] after step1:     l0(" + snapLever(M.levers[0]) + ") l1(" + snapLever(M.levers[1]) + ") wind(" + snapWind(M.winds[0]) + ")");
  for (let i = 0; i < 59; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
  console.log("[A] after step60:    l0(" + snapLever(M.levers[0]) + ") l1(" + snapLever(M.levers[1]) + ") wind(" + snapWind(M.winds[0]) + ")");
}

// ---- B. 240f idle 全家福 ----
{
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  for (let i = 0; i < 240; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
  console.log("[B] 240f idle: l0(" + snapLever(M.levers[0]) + ") l1(" + snapLever(M.levers[1]) + ") wind(" + snapWind(M.winds[0]) + ")");
  console.log("[B] platforms: p0=" + snapPlat(M.platforms[0]) + " p1=" + snapPlat(M.platforms[1]));
  console.log("[B] pusher b0: t=" + M.pushers[0].joint.GetJointTranslation().toFixed(3) + " state=" + M.pushers[0].state + " pos=" + sx(M.pushers[0].body) + "," + sy(M.pushers[0].body));
  const h = M.hangings[0];
  console.log("[B] hanging: plat=" + sx(h.platform) + "," + sy(h.platform) + " angle=" + (h.platform.GetAngle()*180/Math.PI).toFixed(2));
  console.log("[B] players: fb=" + JSON.stringify(w.snapshotPlayer("fireboy")) + " wg=" + JSON.stringify(w.snapshotPlayer("watergirl")));
}

// ---- C. pusher b0(g0) 真实按压 → platform p0 ----
{
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  const b0 = M.pushers[0], p0 = M.platforms[0];
  const traj = [];
  for (let f = 0; f <= 240; f++) {
    b0.body.ApplyForce(new w.B.b2Vec2(0, -200), b0.body.GetWorldCenter());
    if (f % 40 === 0) traj.push(`f${f}: b0t=${b0.joint.GetJointTranslation().toFixed(3)}/${b0.state} p0=${snapPlat(p0)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("[C] g0 ON (press b0 screen-down 240f):\n  " + traj.join("\n  "));
  traj.length = 0;
  for (let f = 0; f <= 300; f++) {
    if (f % 60 === 0) traj.push(`f${f}: b0t=${b0.joint.GetJointTranslation().toFixed(3)}/${b0.state} p0=${snapPlat(p0)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("[C] g0 OFF (release 300f):\n  " + traj.join("\n  "));
}

// ---- D. lever l1(g3) 扳动 → platform p1（堵位判定）----
{
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  const l1 = M.levers[1], p1 = M.platforms[1];
  const traj = [];
  for (let f = 0; f <= 300; f++) {
    l1.body.ApplyTorque(30, true); // +τ → ja 减小（试探方向）
    if (f % 30 === 0) traj.push(`f${f}: l1ja=${(l1.joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)} l1state=${l1.state} p1=${snapPlat(p1)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("[D] l1 flip attempt (+tau 300f):\n  " + traj.join("\n  "));
  traj.length = 0;
  for (let f = 0; f <= 180; f++) {
    if (f % 30 === 0) traj.push(`f${f}: l1ja=${(l1.joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)} l1state=${l1.state} p1=${snapPlat(p1)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("[D] l1 release 180f:\n  " + traj.join("\n  "));
}

// ---- E. hanging 扰动摆动 ----
{
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  const h = M.hangings[0];
  const plat = h.platform;
  const c = plat.GetWorldCenter();
  const traj = [];
  for (let f = 0; f <= 40; f++) {
    plat.ApplyForce(new w.B.b2Vec2(-60, 0), c); // 向左推板心 40f
    if (f % 10 === 0) traj.push(`f${f}: plat=${sx(plat)},${sy(plat)} ang=${(plat.GetAngle()*180/Math.PI).toFixed(1)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  for (let f = 41; f <= 360; f++) {
    if (f % 40 === 0) traj.push(`f${f}: plat=${sx(plat)},${sy(plat)} ang=${(plat.GetAngle()*180/Math.PI).toFixed(1)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("[E] hanging push-left then release:\n  " + traj.join("\n  "));
}

// ---- F. wind ON/OFF A/B：fb 从顶台西缘走落，穿风柱下落轨迹对照 ----
function windRun(label, preTurnOff) {
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  if (preTurnOff) {
    // 扳 l0（g4）：+τ 压 ja 过 0 → state 1→0 → wind.state=0
    for (let f = 0; f < 240 && M.winds[0].state !== 0; f++) {
      M.levers[0].body.ApplyTorque(30, true);
      w.step(1 / 60, { fireboy: {}, watergirl: {} });
    }
  }
  for (let i = 0; i < 60; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} }); // settle
  const windState = M.winds[0].state;
  const fb = w.snapshotPlayer("fireboy");
  const traj = [`start fb=${fb.x},${fb.y} windState=${windState}`];
  for (let f = 0; f <= 90; f++) {
    w.step(1 / 60, { fireboy: { left: true }, watergirl: {} });
    if (f % 30 === 0) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=${p.x},${p.y}`); }
  }
  for (let f = 91; f <= 300; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 30 === 0) { const p = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=${p.x},${p.y}${p.dead ? " DEAD" : ""}`); }
  }
  console.log(`[F] ${label}:\n  ` + traj.join("\n  "));
  return windState;
}
windRun("F1 wind as-f0 (lever auto)", false);
windRun("F2 wind forced OFF (torque l0)", true);
console.log("done");

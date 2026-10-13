// forest_25 探针2：G) l0 扭矩扳动调试 H) wind ON/OFF A/B（fb 走落顶台西缘→停在 r8 块上被风吹离对照）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const sx = (b) => +(b.GetPosition().x * -32).toFixed(2);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(2);

// ---- G. l0 (g4) 扳 OFF 调试：+30 与 +100 扭矩各 200f ----
for (const tau of [30, 100]) {
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  const l0 = M.levers[0];
  const traj = [];
  for (let f = 0; f <= 200; f++) {
    l0.body.ApplyTorque(tau, true);
    if (f % 20 === 0) traj.push(`f${f}: ja=${(l0.joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)} l0=${l0.state} wind=${M.winds[0].state}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log(`[G] l0 torque +${tau}:\n  ` + traj.join("\n  "));
  // 停扭之后 120f：马达是否保持
  traj.length = 0;
  for (let f = 0; f <= 120; f++) {
    if (f % 40 === 0) traj.push(`f${f}: ja=${(l0.joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)} l0=${l0.state} wind=${M.winds[0].state}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log(`[G] l0 after release:\n  ` + traj.join("\n  "));
}

// ---- H. wind A/B：fb 左行至西缘(x<840)停输入，站上 r8 块(y256)看是否被吹走 ----
function runH(label, forceOff) {
  const w = makeWorld("forest_25");
  const M = w.mechanisms;
  if (forceOff) {
    // 先按 G 的可行方法扳 l0 → 若扭矩无效则直接置 state（记录用哪种）
    let flipped = false;
    for (let f = 0; f < 300 && !flipped; f++) {
      M.levers[0].body.ApplyTorque(100, true);
      w.step(1 / 60, { fireboy: {}, watergirl: {} });
      if (M.levers[0].state === 0 && M.winds[0].state === 0) flipped = true;
    }
    if (!flipped) {
      M.levers[0].state = 0; M.winds[0].state = 0; // 直接置态（隔离实验，21号档 E7 先例）
    }
    console.log(`[H] ${label}: leverFlipWorked=${flipped} windState=${M.winds[0].state}`);
  } else {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  for (let i = 0; i < 59; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
  const traj = [`windState=${M.winds[0].state}`];
  let stopped = false;
  for (let f = 0; f <= 600; f++) {
    const inp = stopped ? {} : { left: true };
    const p = w.snapshotPlayer("fireboy");
    if (!stopped && p.x < 840) { stopped = true; traj.push(`f${f}: ledge-clear x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} -> input stop`); }
    w.step(1 / 60, { fireboy: inp, watergirl: {} });
    if (f % 30 === 0) { const q = w.snapshotPlayer("fireboy"); traj.push(`f${f}: fb=${q.x.toFixed(1)},${q.y.toFixed(1)}${q.dead ? " DEAD" : ""}`); }
    if (w.snapshotPlayer("fireboy").dead && f > 30) break;
  }
  console.log(`[H] ${label}:\n  ` + traj.join("\n  "));
}
runH("H1 wind as-f0(ON)", false);
runH("H2 wind OFF", true);
console.log("done");

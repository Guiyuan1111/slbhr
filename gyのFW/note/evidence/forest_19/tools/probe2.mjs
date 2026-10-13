// forest_19 机关运动学探针2：力方向校准 + 真实按压驱动的 g5/g1/g2 全行程实测
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_19");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
const B = w.B;
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const step = (n) => { for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} }); };

// ---- A. 球重力静止位（标定 y 轴/重力方向）----
const ball = M.props[0].body;
step(240);
console.log("[A] ball after 240f idle: screen=", sx(ball), sy(ball), "(build 144,436.8; 平面块顶 y448)");

// ---- B. 力方向校准：b2 (0,+200) 推球 60f ----
const y0 = sy(ball);
for (let i = 0; i < 60; i++) { ball.ApplyForce(new B.b2Vec2(0, 200), ball.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
console.log("[B] ball under b2-force(0,+200): y", y0, "->", sy(ball), sy(ball) > y0 ? "(向屏幕下方)" : "(向屏幕上方)");
step(120);

// ---- C. 按压方向校准：b3 用 (0,+200) 试压 ----
const b3 = M.pushers[3];
for (let i = 0; i < 90; i++) { b3.body.ApplyForce(new B.b2Vec2(0, 200), b3.body.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
console.log("[C] pusher b3 under b2-force(0,+200): t=", b3.joint.GetJointTranslation().toFixed(3), "state=", b3.state, "（对照：force(0,-200) 曾得 t=0.708/state=1）");
step(60);

// ---- D. g5 真实按压全行程（压 b1=(576,128) 顶块钮 240f，采平台轨迹）----
const b1 = M.pushers[1];
const b2p = M.pushers[2];
const plat = (i) => M.platforms[i];
const snapP = () => M.platforms.map((p, i) => `P${i}=${sx(p.body)},${sy(p.body)}`).join(" ");
console.log("[D] before:", snapP());
const traj = [];
for (let f = 0; f <= 300; f++) {
  b1.body.ApplyForce(new B.b2Vec2(0, -200), b1.body.GetWorldCenter());
  if (f % 30 === 0) traj.push(`f${f}: ` + snapP());
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[D] g5 ON (press b1 300f):\n  " + traj.join("\n  "));
traj.length = 0;
for (let f = 0; f <= 330; f++) {
  if (f % 60 === 0) traj.push(`f${f}: ` + snapP());
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[D] g5 OFF (release 330f):\n  " + traj.join("\n  "));
console.log("[D] b1 t/state after release:", b1.joint.GetJointTranslation().toFixed(3), b1.state, " b2(另一g5钮) t:", b2p.joint.GetJointTranslation().toFixed(3), b2p.state);

// ---- E. g1 真实按压（压 b0=(160,576) 180f）----
const b0 = M.pushers[0];
const g1traj = [];
for (let f = 0; f <= 180; f++) {
  b0.body.ApplyForce(new B.b2Vec2(0, -200), b0.body.GetWorldCenter());
  if (f % 30 === 0) g1traj.push(`f${f}: P(g1)=${sx(plat(4).body)},${sy(plat(4).body)}`);
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[E] g1 ON (press b0):", g1traj.join("  "));
step(240);
console.log("[E] after release+240f: P(g1)=", sx(plat(4).body), sy(plat(4).body));

// ---- F. g2 真实按压（压 b3=(64,896) 180f，细采样）----
const g2traj = [];
for (let f = 0; f <= 180; f++) {
  b3.body.ApplyForce(new B.b2Vec2(0, -200), b3.body.GetWorldCenter());
  if (f % 30 === 0) g2traj.push(`f${f}: P(g2)=${sx(plat(5).body)},${sy(plat(5).body)}`);
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[F] g2 ON (press b3):", g2traj.join("  "));
step(240);
console.log("[F] after release+240f: P(g2)=", sx(plat(5).body), sy(plat(5).body));

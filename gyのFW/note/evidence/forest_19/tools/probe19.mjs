// forest_19 机关运动学探针：压推块→平台实走行程；id26/id28 堵死验证；液体/门 fixture 语义
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_19");
const world = w.built?.world ?? w.world;
const M = w.mechanisms;
const B = w.B;
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(1), y: +(b.GetPosition().y * -32).toFixed(1) });
const S = {};
console.log("built keys:", Object.keys(w.built ?? {}));
const doors = w.built?.doors ?? w.doors;
console.log("built.doors:", doors ? Object.entries(doors).map(([k, d]) => `${k}: keys=${Object.keys(d).join("/")}`).join(" | ") : "n/a");

// fixture userData 语义（液体体 + 门条）
let bb = world.GetBodyList(), idx = 0;
while (bb) {
  if (idx === 35 || idx === 17 || idx === 18) {
    let fx = bb.GetFixtureList(), k = 0;
    const lines = [];
    while (fx) {
      lines.push(`fx${k} ud=${JSON.stringify(fx.GetUserData?.() ?? fx.m_userData)} filter(cat=${fx.GetFilterData?.().categoryBits},mask=${fx.GetFilterData?.().maskBits}) isSensor=${fx.IsSensor?.()}`);
      fx = fx.GetNext(); k++;
    }
    console.log(`b${idx}:`, lines.join(" | "));
  }
  bb = bb.GetNext(); idx++;
}

const platSnap = () => M.platforms.map((p, i) => `P${i}(g${p.group})=${px(p.body).x},${px(p.body).y}`).join(" ");
const pushSnap = () => M.pushers.map((p, i) => `b${i}(g${p.group})t=${p.joint.GetJointTranslation().toFixed(3)},st=${p.state}`).join(" ");
const step = (n) => { for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} }); };

console.log("\n[f0] pushers:", pushSnap());
console.log("[f0] platforms:", platSnap());
step(120);
console.log("[after 120f idle] pushers:", pushSnap());
console.log("[after 120f idle] platforms:", platSnap());

// --- 压推块实验：向 pusher 施加屏幕向下的力（b2 -y）---
const press = M.pushers[3]; // b3 = (64,896) g2 底板推块
for (let i = 0; i < 90; i++) {
  press.body.ApplyForce(new B.b2Vec2(0, -200), press.body.GetWorldCenter());
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[press b3 90f F=-200b2] b3 t/state:", press.joint.GetJointTranslation().toFixed(3), press.state);

// --- g5 信号 ON：4 平台实走 ---
for (const p of M.pushers) if (p.group === 5) p.state = 1;
M.manager.deviceChanged();
const traj = [];
for (let f = 0; f <= 300; f++) {
  if (f % 60 === 0) traj.push(`f${f}:` + M.platforms.map((p, i) => `P${i}=${px(p.body).y}`).join(","));
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[g5 ON 300f] 平台 Y 轨迹:\n  " + traj.join("\n  "));

// g5 OFF 回程
for (const p of M.pushers) if (p.group === 5) p.state = 0;
M.manager.deviceChanged();
step(300);
console.log("[g5 OFF 300f] platforms:", platSnap());

// --- g1 ON：平台 id26（左壁） ---
M.pushers[0].state = 1; // b0=(160,576) g1
M.manager.deviceChanged();
const t1 = [];
for (let f = 0; f <= 180; f++) {
  if (f % 60 === 0) t1.push(`f${f}:` + M.platforms.filter(p => p.group === 1).map(p => `${px(p.body).x},${px(p.body).y}`).join(","));
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[g1 ON 180f] P(g1) 轨迹:", t1.join("  "));
M.pushers[0].state = 0; M.manager.deviceChanged(); step(180);

// --- g2 ON：平台 id28（落地竖板） ---
M.pushers[3].state = 1; // b3=(64,896) g2
M.manager.deviceChanged();
const t2 = [];
for (let f = 0; f <= 180; f++) {
  if (f % 60 === 0) t2.push(`f${f}:` + M.platforms.filter(p => p.group === 2).map(p => `${px(p.body).x},${px(p.body).y}`).join(","));
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
}
console.log("[g2 ON 180f] P(g2) 轨迹:", t2.join("  "));
console.log("[final] pushers:", pushSnap());

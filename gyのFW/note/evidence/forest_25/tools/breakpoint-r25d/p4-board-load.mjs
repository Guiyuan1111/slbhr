// r25d p4：新内核吊板载入动力学复验（teleport 快进，坐标屏幕 px，phys=双轴取负/32）
// 复验 r25c 旧结论：软着陆 x770 板倾 0.109rad 东倾；泵摆响应；全速西行甩飞风险
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
let B;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const LL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
console.log("prelude: wind=", w.mechanisms.winds?.[0]?.state);

const fb = w.players.fireboy;
B = globalThis.box2d;
function tp(x, y, vx = 0, vy = 0) {
  fb.body.SetTransformVecRadians(new B.b2Vec2(-x / 32, -y / 32), 0);
  fb.body.SetLinearVelocity(new B.b2Vec2(-vx / 32, -vy / 32));
}
const snap = (tag) => {
  const p = w.snapshotPlayer("fireboy");
  const h = w.mechSnapshot().hangings[0];
  console.log(`${tag}: fb=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} dead=${p.dead} | 板心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(4)}`);
  return { p, h };
};

// ── A1: 软着陆静载分布（落在板上各 x，id 立 240f 看滑移/稳态倾角） ──
console.log("\n=== A1 软着陆静载（vy=100px/s 落板, idle 240f） ===");
for (const x0 of [620, 660, 700, 740, 770, 800]) {
  tp(x0, 690, 0, 100);
  for (let i = 0; i < 240; i++) { w.step(1 / 60, { fireboy: N, watergirl: N }); if (fb.dead) break; }
  snap(`A1 x0=${x0}`);
}

// ── A2: 泵摆响应（站 x770，R 脉冲 12f → N 12f 交替 6 组，读板心摆动） ──
console.log("\n=== A2 泵摆 R/N 脉冲（起点 x770 站稳后） ===");
tp(770, 690, 0, 100);
for (let i = 0; i < 120; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
snap("A2 起始");
for (let k = 0; k < 6; k++) {
  for (let i = 0; i < 12; i++) w.step(1 / 60, { fireboy: R, watergirl: N });
  for (let i = 0; i < 12; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  snap(`A2 组${k + 1}`);
}
// 继续 N 惯性观察 120f
for (let i = 0; i < 120; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
snap("A2 释放120f后");

// ── A2b: 板上 L 长按（probe14 甩飞复验） ──
console.log("\n=== A2b 板上 L 长按 60f（旧探针甩飞场景） ===");
tp(770, 690, 0, 100);
for (let i = 0; i < 120; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
for (let i = 0; i < 60; i++) w.step(1 / 60, { fireboy: L, watergirl: N });
snap("A2b L60f后");
for (let i = 0; i < 90; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
snap("A2b 再90f后");
console.log(fb.dead ? "A2b: DEAD" : "A2b: alive");

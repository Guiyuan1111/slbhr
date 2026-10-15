// r25d p5：新内核吊板载入动力学（每案新世界）—— A1 静载分布 / A2 泵摆 / A2b L长按
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };

function fresh() {
  const w = makeWorld("forest_25");
  for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
  return w;
}
const BB = () => globalThis.box2d;
function tp(w, x, y, vx = 0, vy = 0) {
  w.players.fireboy.body.SetTransformVecRadians(new (BB()).b2Vec2(-x / 32, -y / 32), 0);
  w.players.fireboy.body.SetLinearVelocity(new (BB()).b2Vec2(-vx / 32, -vy / 32));
}
function snap(w, tag) {
  const p = w.snapshotPlayer("fireboy");
  const h = w.mechSnapshot().hangings[0];
  console.log(`${tag}: fb=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} dead=${p.dead} | 板心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(4)}`);
  return p;
}

// ── A1: 软着陆静载分布（每案新世界）──
console.log("=== A1 软着陆静载（vy=100 落板, idle 240f, 每案新世界） ===");
for (const x0 of [700, 740, 770, 800, 820]) {
  const w = fresh();
  tp(w, x0, 690, 0, 100);
  let out = "";
  for (let i = 0; i < 240; i++) {
    w.step(1 / 60, { fireboy: N, watergirl: N });
    if (i === 60 || i === 120) {
      const p = w.snapshotPlayer("fireboy"), h = w.mechSnapshot().hangings[0];
      out += ` [f${i}: (${px(p.x)},${px(p.y)}) ang=${h.angle.toFixed(3)}]`;
    }
    if (w.snapshotPlayer("fireboy").dead) break;
  }
  snap(w, `A1 x0=${x0}`);
  if (out) console.log(`   轨迹:${out}`);
}

// ── A2: 泵摆响应（站 x770 → R 12f/N 12f ×6 → 释放 120f）──
console.log("\n=== A2 泵摆 R/N 脉冲（起点 x770） ===");
{
  const w = fresh();
  tp(w, 770, 690, 0, 100);
  for (let i = 0; i < 120; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  snap(w, "A2 起始");
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 12; i++) w.step(1 / 60, { fireboy: R, watergirl: N });
    for (let i = 0; i < 12; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
    if (k >= 3) snap(w, `A2 组${k + 1}`);
  }
  for (let i = 0; i < 120; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  snap(w, "A2 释放120f后");
}

// ── A2b: 板上 L 长按 60f（probe14 甩飞复验） ──
console.log("\n=== A2b 板上 L 长按 60f ===");
{
  const w = fresh();
  tp(w, 770, 690, 0, 100);
  for (let i = 0; i < 120; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  for (let i = 0; i < 60; i++) {
    w.step(1 / 60, { fireboy: L, watergirl: N });
    if (i % 15 === 0) snap(w, `A2b L${i}f`);
  }
  for (let i = 0; i < 90; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  snap(w, "A2b 再90f后");
  console.log(w.snapshotPlayer("fireboy").dead ? "A2b: DEAD" : "A2b: alive");
}

// r25d p10：p0 敞开下的走廊全程退出 + wg 实体扳 l0 关风 + wg 实体压 b0
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);

function fresh() {
  const w = makeWorld("forest_25");
  for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
  return w;
}
function tp(w, role, x, y, vx = 0, vy = 0) {
  const b = w.players[role].body;
  b.SetTransformVecRadians(vec(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(vec(-vx / 32, -vy / 32));
}
const press = (w, on) => { if (on) w.mechanisms.pushers[0].body.ApplyForce(vec(0, -200), w.mechanisms.pushers[0].body.GetWorldCenter()); };

// ── A: 走廊全程（p0 敞开模拟）──
console.log("=== A 走廊全程：扳杆→跳越→(p0开)西行上楔→东岸 ===");
for (const jx of [1190, 1198]) {
  const w = fresh();
  tp(w, "fireboy", 1080, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  let flipF = -1;
  for (let f = 0; f < 240; f++) { w.step(1 / 60, { fireboy: R, watergirl: N }); if (w.mechanisms.levers[1].state === 1 && flipF < 0) flipF = f; }
  tp(w, "fireboy", jx, 860, 0, 0);
  for (let i = 0; i < 25; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  let jumped = -1, out = `flip@${flipF} jx=${jx}: `;
  for (let f = 0; f < 400; f++) {
    let inp;
    if (jumped < 0) { inp = UL; jumped = f; }
    else inp = L;
    press(w, true);
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const p = w.snapshotPlayer("fireboy");
    if (p.dead) { out += `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (w.mechanisms.levers[1].state === 0) { out += `翻回0 f${f}`; break; }
    if (p.x < 1010 && p.x > 900 && p.y < 845 && Math.abs(p.vy) < 8) { out += `★东岸 f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (f === 399) out += `未达 @(${px(p.x)},${px(p.y)}) ${p.anim}`;
  }
  console.log(out);
}

// ── B: wg 实体扳 l0（横带东行顶杆尖）──
console.log("\n=== B wg 实体扳 l0 关风：tp wg (400,412) 东行 ===");
{
  const w = makeWorld("forest_25"); // 风 ON 原生
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  console.log("B 初始 wind=", w.mechanisms.winds?.[0]?.state, "l0=", w.mechanisms.levers[0].state);
  tp(w, "watergirl", 400, 412, 0, 0); // 横带 y448 站姿 center≈412.5
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  const p0 = w.snapshotPlayer("watergirl");
  console.log(`B wg站稳 (${px(p0.x)},${px(p0.y)}) wind=${w.mechanisms.winds?.[0]?.state}`);
  let flipF = -1;
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: N, watergirl: R });
    const ws = w.mechanisms.winds?.[0]?.state;
    if (ws === 0 && flipF < 0) { flipF = f; const p = w.snapshotPlayer("watergirl"); console.log(`B ★风关 f${f} wg=(${px(p.x)},${px(p.y)}) l0=${w.mechanisms.levers[0].state}`); }
    if (f % 40 === 0) { const p = w.snapshotPlayer("watergirl"); console.log(`B f${f} wg=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) wind=${ws} l0=${w.mechanisms.levers[0].state}`); }
    if (flipF >= 0 && f > flipF + 60) break;
  }
}

// ── C: wg 实体压 b0（左上平台 (80,128)）──
console.log("\n=== C wg 实体压 b0：tp wg (80,96) idle ===");
{
  const w = makeWorld("forest_25");
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  tp(w, "watergirl", 80, 96, 0, 0); // 平台顶 y128 站姿 center≈96
  let st1 = -1;
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: N, watergirl: N });
    const s = w.mechanisms.pushers[0].state;
    if (s === 1 && st1 < 0) {
      st1 = f;
      const p = w.snapshotPlayer("watergirl");
      const b0 = w.mechanisms.pushers[0];
      const p0 = w.mechSnapshot().platforms.find(q => q.id === 0);
      console.log(`C ★b0按下 f${f} wg=(${px(p.x)},${px(p.y)}) p0.y=${px(p0.y)}`);
    }
    if (f === 299) {
      const p = w.snapshotPlayer("watergirl");
      const p0 = w.mechSnapshot().platforms.find(q => q.id === 0);
      console.log(`C 终态 f300 wg=(${px(p.x)},${px(p.y)}) b0.state=${w.mechanisms.pushers[0].state} p0=(${px(p0.x)},${px(p0.y)})`);
    }
  }
}

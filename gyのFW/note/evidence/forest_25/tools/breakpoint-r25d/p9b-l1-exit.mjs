// r25d p9b：天花跳越细化——落点/东岸退出全程
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
function tp(w, x, y, vx = 0, vy = 0) {
  w.players.fireboy.body.SetTransformVecRadians(vec(-x / 32, -y / 32), 0);
  w.players.fireboy.body.SetLinearVelocity(vec(-vx / 32, -vy / 32));
}
const L1 = (w) => w.mechanisms.levers[1].state;

// 完整走廊场景：tp 井底西口 → 东行扳杆 → 站定东端 → 天花跳 → 西行上楔出走廊到东岸
function corridorRun(jx, holdUp, tag) {
  const w = fresh();
  tp(w, 1062, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  let flipF = -1;
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: R, watergirl: N });
    if (L1(w) === 1 && flipF < 0) flipF = f;
    const p = w.snapshotPlayer("fireboy");
    if (p.x > 1198 && Math.abs(p.vx) < 5 && f > 40) break;
  }
  const sn1 = w.snapshotPlayer("fireboy");
  // 站定 → 跳
  tp(w, jx, 860, 0, 0);
  for (let i = 0; i < 20; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  let jumped = -1, out = `flip@f${flipF} 停@(${px(sn1.x)},${px(sn1.y)}) 跳点=${jx} `;
  for (let f = 0; f < 400; f++) {
    let inp;
    if (jumped < 0) { inp = UL; jumped = f; }
    else inp = f - jumped < holdUp ? L : (f - jumped < holdUp + 60 ? L : N);
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const p = w.snapshotPlayer("fireboy");
    if (p.dead) { out += `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (L1(w) === 0) { out += `翻回0 f${f} @(${px(p.x)},${px(p.y)})`; break; }
    // 到东岸（x 896-1024, 站 y864 → center 832）
    if (p.x < 1010 && p.x > 900 && p.y < 845 && Math.abs(p.vy) < 8) {
      out += `★东岸 f${f} @(${px(p.x)},${px(p.y)}) l1=${L1(w)} p1x=${px(w.mechSnapshot().platforms.find(q => q.id === 1).x)}`;
      break;
    }
    if (f === 399) out += `未达 @(${px(p.x)},${px(p.y)}) ${p.anim} l1=${L1(w)}`;
  }
  console.log(`${tag}: ${out}`);
}

console.log("=== 走廊全程：扳杆→跳越→西行上楔→东岸 ===");
for (const jx of [1202, 1195, 1188, 1210]) corridorRun(jx, 25, `jx=${jx}/hold25`);
corridorRun(1195, 15, "jx=1195/hold15");
corridorRun(1195, 35, "jx=1195/hold35");
corridorRun(1195, 45, "jx=1195/hold45");

// r25d p9c：东行扳杆铲射盆地扫描——起点 x × R持继时长 → 翻转帧/终态/l1 保持
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

console.log("=== 东行扳杆：起点扫描（R 连续 300f） ===");
for (let sx = 1056; sx <= 1092; sx += 4) {
  const w = fresh();
  tp(w, sx, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  let flipF = -1, maxE = 0;
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: R, watergirl: N });
    if (L1(w) === 1 && flipF < 0) flipF = f;
    maxE = Math.max(maxE, w.snapshotPlayer("fireboy").x);
  }
  const p = w.snapshotPlayer("fireboy");
  console.log(`sx=${sx}: flip@${flipF} maxX=${px(maxE)} 终态=(${px(p.x)},${px(p.y)}) l1=${L1(w)} ${p.dead ? "DEAD" : ""}`);
}

// 最优起点上：天花跳越→西行上楔→东岸 全程（R 持续到跳前）
console.log("\n=== 走廊全程（起点 1080，R 240f → 站定 → 天花跳 → L 西行） ===");
for (const jx of [1190, 1198, 1206]) {
  for (const hold of [20, 30]) {
    const w = fresh();
    tp(w, 1080, 860, 0, 0);
    for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
    let flipF = -1;
    for (let f = 0; f < 240; f++) {
      w.step(1 / 60, { fireboy: R, watergirl: N });
      if (L1(w) === 1 && flipF < 0) flipF = f;
    }
    tp(w, jx, 860, 0, 0);
    for (let i = 0; i < 25; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
    let jumped = -1, out = `flip@${flipF} jx=${jx} hold=${hold}: `;
    for (let f = 0; f < 400; f++) {
      let inp;
      if (jumped < 0) { inp = UL; jumped = f; }
      else inp = L; // 跳后一直按 L 西行（上楔爬坡）
      w.step(1 / 60, { fireboy: inp, watergirl: N });
      const p = w.snapshotPlayer("fireboy");
      if (p.dead) { out += `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
      if (L1(w) === 0) { out += `翻回0 f${f} @(${px(p.x)},${px(p.y)})`; break; }
      if (p.x < 1010 && p.x > 900 && p.y < 845 && Math.abs(p.vy) < 8) {
        out += `★东岸 f${f} @(${px(p.x)},${px(p.y)}) l1=${L1(w)}`;
        break;
      }
      if (f === 399) out += `未达 @(${px(p.x)},${px(p.y)}) ${p.anim} l1=${L1(w)}`;
    }
    console.log(out);
  }
}

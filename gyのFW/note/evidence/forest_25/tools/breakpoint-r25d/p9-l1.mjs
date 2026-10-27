// r25d p9：走廊 l1 实证——A 东行穿杆翻转 0→1；B 回程西行是否翻回；C 天花跳越退出
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
const P1 = (w) => w.mechSnapshot().platforms.find(p => p.id === 1);
const sn = (w, tag) => {
  const p = w.snapshotPlayer("fireboy");
  
  console.log(`${tag}: fb=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} | l1.state=${L1(w)} p1=${JSON.stringify(P1(w)?.x)} dead=${p.dead}`);
};

// ── A: 井底东行穿杆 ──
console.log("=== A: tp (1080,860) 东行 ===");
{
  const w = fresh();
  tp(w, 1080, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  sn(w, "A 起始站稳");
  let flipped = -1;
  for (let f = 0; f < 240; f++) {
    w.step(1 / 60, { fireboy: R, watergirl: N });
    if (L1(w) === 1 && flipped < 0) { flipped = f; sn(w, `A ★翻转 f${f}`); }
    if (f % 30 === 0) sn(w, `A f${f}`);
    const p = w.snapshotPlayer("fireboy");
    if (p.dead) { sn(w, `A DEAD f${f}`); break; }
    if (p.x > 1205 && Math.abs(p.vx) < 3 && f > 60) { sn(w, `A 停 f${f}`); break; }
  }
}

// ── B: 翻转后回程西行（是否翻回 0） ──
console.log("\n=== B: 翻转后 tp (1195,860) 西行 ===");
{
  const w = fresh();
  tp(w, 1080, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  for (let i = 0; i < 240; i++) {
    w.step(1 / 60, { fireboy: R, watergirl: N });
    if (L1(w) === 1) break;
  }
  sn(w, "B 翻转完成, tp 东端");
  tp(w, 1198, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  sn(w, "B 起始");
  for (let f = 0; f < 240; f++) {
    w.step(1 / 60, { fireboy: L, watergirl: N });
    if (f % 30 === 0) sn(w, `B f${f}`);
    if (L1(w) === 0) { sn(w, `B ★翻回0 f${f} —— 西行会翻回！`); break; }
    const p = w.snapshotPlayer("fireboy");
    if (p.dead) { sn(w, `B DEAD f${f}`); break; }
    if (p.x < 1100) { sn(w, `B 到 x<1100 f${f} 未翻回`); break; }
  }
}

// ── C: 天花跳越退出（从东端起跳+L，看能否越过东倾杆尖且不翻回） ──
console.log("\n=== C: 天花跳越扫描（tp (1198,860) 站稳后 UL 跳） ===");
for (const jx of [1200, 1190, 1180, 1210]) {
  const w = fresh();
  tp(w, 1080, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  for (let i = 0; i < 240; i++) { w.step(1 / 60, { fireboy: R, watergirl: N }); if (L1(w) === 1) break; }
  tp(w, jx, 860, 0, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  let res = `jx=${jx} l1=${L1(w)} `;
  // 站跳+L 保持
  let jumped = -1;
  for (let f = 0; f < 200; f++) {
    const inp = jumped < 0 ? UL : (f - jumped < 25 ? L : N);
    if (jumped < 0) jumped = f;
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const p = w.snapshotPlayer("fireboy");
    if (p.dead) { res += `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (L1(w) === 0) { res += `★翻回0 f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (f > 60 && Math.abs(p.vy) < 8 && p.x < 1100) { res += `★着陆井西侧 f${f} @(${px(p.x)},${px(p.y)}) l1=${L1(w)}`; break; }
  }
  console.log(res);
}

// r25d p8：jx=890 keepL 乘摆逐帧 trace + 在板西段插入跳越的窗口扫描
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const LL = { up: true, left: true, right: false };

function fresh() {
  const w = makeWorld("forest_25");
  for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
  return w;
}
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);
const st = (w) => {
  const p = w.snapshotPlayer("fireboy");
  const h = w.mechSnapshot().hangings[0];
  return { p, h };
};

// ── trace：jx=890 hold20 keepL ──
console.log("=== trace jx=890 keepL（落板→西跑→离板全程） ===");
{
  const w = fresh();
  fb(w, 890);
  function fb(w, jx) {
    w.players.fireboy.body.SetTransformVecRadians(vec(-jx / 32, -832 / 32), 0);
    w.players.fireboy.body.SetLinearVelocity(vec(0, 0));
  }
  let jumped = -1;
  for (let f = 0; f < 620; f++) {
    const p = w.snapshotPlayer("fireboy");
    let inp = N;
    if (jumped < 0) { inp = { up: true, left: false, right: false }; jumped = f; }
    else inp = L; // keepL 全程
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const { p: p2, h } = st(w);
    if (f >= 50 && f <= 200 && f % 5 === 0) console.log(`f${f}: fb=(${px(p2.x)},${px(p2.y)}) v=(${px(p2.vx)},${px(p2.vy)}) ${p2.anim} | 板心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(3)}`);
    if (f > 200 && f % 20 === 0 && !p2.dead && p2.x > 320) console.log(`f${f}: fb=(${px(p2.x)},${px(p2.y)}) v=(${px(p2.vx)},${px(p2.vy)}) ${p2.anim} | 板心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(3)}`);
    if (p2.dead || (f > 250 && p2.x < 320)) { console.log(`END f${f}: fb=(${px(p2.x)},${px(p2.y)}) ${p2.dead ? "DEAD" : "settled"} | 板ang=${h.angle.toFixed(2)}`); break; }
  }
}

// ── 跳越扫描：同上板，在 fb.x 首次 ≤ XJ 时改按 UL（跳），跳后松所有 ──
console.log("\n=== 板上 UL 跳越扫描（jx=890, keepL 至 x≤XJ 时 UL 30f） ===");
for (const XJ of [560, 540, 520, 500, 480, 460, 440]) {
  const w = fresh();
  w.players.fireboy.body.SetTransformVecRadians(vec(-890 / 32, -832 / 32), 0);
  w.players.fireboy.body.SetLinearVelocity(vec(0, 0));
  let jumped = -1, did = false, res = "";
  for (let f = 0; f < 900; f++) {
    const p = w.snapshotPlayer("fireboy");
    let inp = N;
    if (jumped < 0) { inp = { up: true, left: false, right: false }; jumped = f; }
    else if (!did) {
      inp = L;
      if (p.x <= XJ && p.y < 730 && p.y > 660) { inp = LL; did = true; res = `跳@f${f}(${px(p.x)},${px(p.y)})v(${px(p.vx)},${px(p.vy)}) `; }
    }
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const { p: p2, h } = st(w);
    if (p2.dead) { res += `→ DEAD f${f} @(${px(p2.x)},${px(p2.y)})`; break; }
    if (did && Math.abs(p2.vy) < 8 && p2.y > 690 && p2.y < 725 && p2.x > 190 && p2.x < 290) {
      res += `→ ★岛台顶着陆 f${f} @(${px(p2.x)},${px(p2.y)}) 板ang=${h.angle.toFixed(2)}`;
      break;
    }
    if (did && f > 700) { res += `→ 未判着陆 f${f} @(${px(p2.x)},${px(p2.y)}) ${p2.anim}`; break; }
  }
  console.log(`XJ=${XJ}: ${res}`);
}

// r25d p7：真实上板弧线扫描（东岸站跳+空中L）+ 乘摆监测
// 东岸 y864 (站面), 站跳 rise124 → feet apex 740 = 板顶静止高（贴极限）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };

function fresh() {
  const w = makeWorld("forest_25");
  for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
  return w;
}
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);
function st(w) {
  const p = w.snapshotPlayer("fireboy");
  const h = w.mechSnapshot().hangings[0];
  return { p, h, txt: `fb=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} | 板心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(3)}` };
}

// 站在东岸 (x0, 832) 站跳+空中L holdT 帧，然后按模式：'brake' 松/ 'keepL' 继续按
function boardAttempt(jumpX, holdT, post, rideF = 600, log = false) {
  const w = fresh();
  const fb = w.players.fireboy;
  fb.body.SetTransformVecRadians(vec(-jumpX / 32, -832 / 32), 0);
  fb.body.SetLinearVelocity(vec(0, 0));
  let jumped = -1, out = "";
  for (let f = 0; f < rideF; f++) {
    const p = w.snapshotPlayer("fireboy");
    let inp = N;
    if (jumped < 0) {
      inp = { up: true, left: false, right: false }; jumped = f; // 站跳
    } else if (f - jumped < holdT) inp = L;
    else if (post === "keepL") inp = L;
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const s = st(w);
    if (log && f % 10 === 0) console.log(`  f${f}: ${s.txt}`);
    if (s.p.dead) return `x_dead @(${px(s.p.x)},${px(s.p.y)}) f${f} 板ang=${s.h.angle.toFixed(2)}`;
    if (f > 40 && Math.abs(s.p.vy) < 8 && s.p.y < 725 && s.p.y > 690) {
      // 疑似站上板顶（feet≈740 → center≈708）
      out = `LANDED f${f} @(${px(s.p.x)},${px(s.p.y)}) vx=${px(s.p.vx)}`;
      // 继续乘摆监测 rideF
      let minA = 0, maxA = 0, lastOk = f;
      for (let g = f; g < rideF; g++) {
        w.step(1 / 60, { fireboy: post === "keepL" ? L : N, watergirl: N });
        const s2 = st(w);
        minA = Math.min(minA, s2.h.angle); maxA = Math.max(maxA, s2.h.angle);
        if (s2.p.dead) return `${out} → 摆中坠 f${g} @(${px(s2.p.x)},${px(s2.p.y)}) ang=[${minA.toFixed(2)},${maxA.toFixed(2)}]`;
        lastOk = g;
      }
      return `${out} → 乘摆${rideF - f}f 存活 ang=[${minA.toFixed(2)},${maxA.toFixed(2)}] 终态 ${s2txt(w)}`;
    }
  }
  return `no-land ${out} 终态 ${st(w).txt}`;
}
const s2txt = (w) => { const s = st(w); return `@(${px(s.p.x)},${px(s.p.y)}) ang=${s.h.angle.toFixed(2)}`; };

console.log("=== p7 上板扫描：jumpX × holdL × post ===");
for (const jx of [890, 900, 910]) {
  for (const hold of [20, 25, 30, 35, 40]) {
    for (const post of ["brake", "keepL"]) {
      console.log(`jx=${jx} hold=${hold} ${post}: ${boardAttempt(jx, hold, post)}`);
    }
  }
}

// r25d p9d：天花跳后西行 trace——卡在 1101.7 的原因
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
const tp2 = (x, y, vx = 0, vy = 0) => {
  w.players.fireboy.body.SetTransformVecRadians(vec(-x / 32, -y / 32), 0);
  w.players.fireboy.body.SetLinearVelocity(vec(-vx / 32, -vy / 32));
};
tp2(1080, 860, 0, 0);
for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
for (let f = 0; f < 240; f++) w.step(1 / 60, { fireboy: R, watergirl: N });
tp2(1198, 860, 0, 0);
for (let i = 0; i < 25; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
let jumped = -1;
for (let f = 0; f < 200; f++) {
  let inp;
  if (jumped < 0) { inp = UL; jumped = f; }
  else inp = L;
  w.step(1 / 60, { fireboy: inp, watergirl: N });
  const p = w.snapshotPlayer("fireboy");
  if (f % 5 === 0 && f < 90 || (f >= 90 && f % 15 === 0)) {
    console.log(`f${f}: (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} l1=${w.mechanisms.levers[1].state}`);
  }
}

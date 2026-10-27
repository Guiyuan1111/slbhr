// r25d p10b：wg 实体扳 l0 关风（修正 tp 高度）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const R = { up: false, left: false, right: true };
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);

const w = makeWorld("forest_25");
for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
console.log("初始 wind=", w.mechanisms.winds?.[0]?.state);
const b = w.players.watergirl.body;
b.SetTransformVecRadians(vec(-420 / 32, -395 / 32), 0);
b.SetLinearVelocity(vec(0, 0));
for (let i = 0; i < 40; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
let p = w.snapshotPlayer("watergirl");
console.log(`wg 站稳 (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim}`);
let flipF = -1;
for (let f = 0; f < 360; f++) {
  w.step(1 / 60, { fireboy: N, watergirl: R });
  const ws = w.mechanisms.winds?.[0]?.state;
  if (ws === 0 && flipF < 0) {
    flipF = f;
    p = w.snapshotPlayer("watergirl");
    console.log(`★风关 f${f} wg=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) l0=${w.mechanisms.levers[0].state}`);
  }
  if (f % 60 === 0) {
    p = w.snapshotPlayer("watergirl");
    console.log(`f${f} wg=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) wind=${ws} l0=${w.mechanisms.levers[0].state}`);
  }
  if (p.dead) { console.log(`DEAD f${f}`); break; }
}
// 关风后 wg 停住实验：松 R，看风是否保持 0
for (let f = 0; f < 180; f++) {
  w.step(1 / 60, { fireboy: N, watergirl: N });
  if (f % 60 === 0) {
    p = w.snapshotPlayer("watergirl");
    console.log(`停 f${f} wg=(${px(p.x)},${px(p.y)}) wind=${w.mechanisms.winds?.[0]?.state} l0=${w.mechanisms.levers[0].state}`);
  }
}

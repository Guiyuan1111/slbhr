// trace D 相位后的行为
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const UR = { up: true, left: false, right: true };
const w = makeWorld("forest_25");
for (let f = 0; f < 90; f++) w.step(1 / 60, { fireboy: N, watergirl: N });
for (let f = 90; f < 600; f++) {
  w.step(1 / 60, { fireboy: N, watergirl: L });
  const p = w.snapshotPlayer("watergirl");
  if (p.y > 245 && p.y < 262 && Math.abs(p.vx) < 5 && p.x > 320 && p.x < 352) break;
}
for (let f = 0; f < 60; f++) w.step(1 / 60, { fireboy: N, watergirl: UR });
let jumpHold = 60;
for (let f = 0; f < 120; f++) {
  const inp = f < jumpHold ? UR : N;
  w.step(1 / 60, { fireboy: N, watergirl: inp });
  const p = w.snapshotPlayer("watergirl");
  if (f > 50 && f % 5 === 0) console.log(`落f${f}: (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim}`);
  if (f > 60 && p.y > 175 && p.y < 215 && Math.abs(p.vy) < 5 && p.x > 435 && p.x < 495) { console.log(`★塔顶站稳 f${f} (${px(p.x)},${px(p.y)})`); break; }
}
console.log("--- 切 L 西行 ---");
for (let f = 0; f < 200; f++) {
  w.step(1 / 60, { fireboy: N, watergirl: L });
  const p = w.snapshotPlayer("watergirl");
  if (f % 5 === 0) console.log(`D+${f}: (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim}`);
  if (p.y > 435) { console.log(`★走落 f${f}`); break; }
  if (p.dead) { console.log(`DEAD f${f}`); break; }
}

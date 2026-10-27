// 冻结帧接触调查：wg 扳杆后西行冻结在 431.6
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const w = makeWorld("forest_25");
for (let f = 0; f < 90; f++) w.step(1 / 60, { fireboy: N, watergirl: N });
for (let f = 90; f < 600; f++) w.step(1 / 60, { fireboy: N, watergirl: L }); // 到台沿
for (let f = 0; f < 28; f++) w.step(1 / 60, { fireboy: N, watergirl: UR });
for (let f = 0; f < 200; f++) w.step(1 / 60, { fireboy: N, watergirl: N });  // 落塔顶站稳
for (let f = 0; f < 130; f++) w.step(1 / 60, { fireboy: N, watergirl: (f % 10 < 3) ? L : N }); // 脉冲踱出
for (let f = 0; f < 60; f++) w.step(1 / 60, { fireboy: N, watergirl: N });  // 落带站稳
let windOff = -1;
for (let f = 0; f < 120; f++) {
  w.step(1 / 60, { fireboy: N, watergirl: R });
  if (w.mechanisms.winds[0].state === 0) { windOff = f; break; }
}
console.log("windOff:", windOff);
for (let f = 0; f < 130; f++) {
  const evs = w.step(1 / 60, { fireboy: N, watergirl: L });
  const p = w.snapshotPlayer("watergirl");
  if (f % 4 === 0 || Math.abs(p.vx) < 5) {
    const lv = w.mechanisms.levers[0];
    const lp = lv.body.GetPosition();
    console.log(`f${f}: (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} l0体=(${px(-lp.x*32)},${px(-lp.y*32)}) 角=${lv.body.GetAngle().toFixed(2)} ev=${JSON.stringify(evs)}`);
  }
  if (Math.abs(p.vx) < 1 && f > 20) { console.log(`★冻结 f${f}`); break; }
}

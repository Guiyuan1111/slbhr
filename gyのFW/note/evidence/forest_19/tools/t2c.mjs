// r19c t2c：落板后板姿态逐帧观测（角度/位置 300f）—— 板到底摆不摆？
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const run = (REL, R, WALK) => {
  const w = makeWorld("forest_19");
  let curF = 0;
  const step = (n, fbIn = {}, wgIn = {}) => { for (let i = 0; i < n; i++) { w.step(1 / 60, { fireboy: fbIn, watergirl: wgIn }); curF++; } };
  step(10); step(22, { left: true }); step(1, { left: true, up: true }); step(60, { left: true }); step(60);
  step(90, { left: true }); step(30); step(12, { left: true }); step(25); step(6, { left: true }); step(25);
  step(8, { left: true }); step(1, { left: true, up: true }); step(10, { left: true }); step(20); step(200);
  step(REL - 580, {}, { right: true }); step(9);
  step(1, {}, { up: true, right: true }); step(1, {}, { right: true }); step(Math.max(0, R - 2), {}, { right: true });
  const b2 = w.mechanisms.hangings[1].platform;
  const bg = () => `板(${(b2.GetPosition().x * -32).toFixed(1)},${(b2.GetPosition().y * -32).toFixed(1)})a=${(b2.GetAngle() * 180 / Math.PI).toFixed(1)}°`;
  const out = [];
  for (let k = 0; k < 150; k++) {
    const hold = WALK && k >= WALK[0] && k < WALK[1] ? { left: true } : {};
    step(2, {}, hold);
    const wg = w.snapshotPlayer("watergirl");
    if (k % 5 === 0) out.push(`f${curF}wg(${wg.x.toFixed(0)},${wg.y.toFixed(0)})${bg()}${wg.dying ? "D" : ""}`);
    if (wg.dying || wg.dead) break;
  }
  console.log(`REL${REL} R${R} WALK${WALK ? WALK.join("-") : "-"}: ` + out.join(" "));
};
run(642, 14, null);          // 落板西半（x~385）静观
run(640, 22, [60, 120]);     // 落板东半（x>400）后西行
run(642, 20, [40, 100]);     // 落板中（x~400）后西行

// r19c t3：b2 板西摆策略扫描 —— S1 走到板尖静观 / S2 尖上连续小跳泵摆 / S3 慢行过轴
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const run = (tag, REL, R, plan) => {
  const w = makeWorld("forest_19");
  let curF = 0;
  const step = (n, fbIn = {}, wgIn = {}) => { for (let i = 0; i < n; i++) { w.step(1 / 60, { fireboy: fbIn, watergirl: wgIn }); curF++; } };
  step(10); step(22, { left: true }); step(1, { left: true, up: true }); step(60, { left: true }); step(60);
  step(90, { left: true }); step(30); step(12, { left: true }); step(25); step(6, { left: true }); step(25);
  step(8, { left: true }); step(1, { left: true, up: true }); step(10, { left: true }); step(20); step(200);
  step(REL - 580, {}, { right: true }); step(9);
  step(1, {}, { up: true, right: true }); step(1, {}, { right: true }); step(Math.max(0, R - 2), {}, { right: true });
  const b2 = w.mechanisms.hangings[1].platform;
  const bg = () => `板(${(b2.GetPosition().x * -32).toFixed(0)},${(b2.GetPosition().y * -32).toFixed(0)})a${(b2.GetAngle() * 180 / Math.PI).toFixed(1)}`;
  const out = [];
  for (let k = 0; k < 400; k++) {
    const inp = plan(k);
    step(1, {}, inp);
    if (k % 10 === 0) {
      const wg = w.snapshotPlayer("watergirl");
      out.push(`f${curF}(${wg.x.toFixed(0)},${wg.y.toFixed(0)})${bg()}${wg.dying ? "D" : ""}`);
      if (wg.dying || wg.dead) break;
    }
  }
  console.log(`[${tag}] ` + out.join(" "));
};
// S1: 落板后一路西行到尖(x~350)停住静观
run("S1 行至尖静观", 642, 16, (k) => (k < 60 ? { left: true } : {}));
// S2: 行至尖后原地连续小跳（每40f一跳）
run("S2 尖上小跳泵", 642, 16, (k) => (k < 60 ? { left: true } : (k % 40 === 0 ? { up: true } : (k % 40 === 1 ? {} : {}))));
// S3: 慢行：走10停10交替西移
run("S3 慢行泵", 642, 16, (k) => (k % 20 < 10 ? { left: true } : {}));

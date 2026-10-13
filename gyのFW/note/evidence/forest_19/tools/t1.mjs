// r19c t1：fb 段1复刻（s1 流程）+ 逐段帧位标注 —— 确认 spawn→跳池①→r6→顶台→B 全程仍成立
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_19");
const M = w.mechanisms;
let curF = 0;
const step = (n, fbIn = {}, wgIn = {}) => { for (let i = 0; i < n; i++) { w.step(1 / 60, { fireboy: fbIn, watergirl: wgIn }); curF++; } };
const snap = (tag) => {
  const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
  console.log(`[${tag}] f=${curF} fb=(${fb.x.toFixed(1)},${fb.y.toFixed(1)})${fb.dying ? " DYING" : ""} wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)}) push=[${M.pushers.map(p => `g${p.group}:${p.state}`).join(",")}]`);
};
snap("f0");
step(10); snap("f10 settle");
step(22, { left: true }); snap("f32 跑西22f 边缘?");
step(1, { left: true, up: true }); snap("f33 起跳");
step(60, { left: true }); snap("f93 空中60f");
step(60); snap("f153");
step(90, { left: true }); snap("f243 r6→西行?");
step(30); snap("f273 顶台?");
step(12, { left: true }); step(25); snap("f310");
step(6, { left: true }); step(25); snap("f341 到位613?");
step(8, { left: true }); snap("f349 west8 ~600?");
step(1, { left: true, up: true }); snap("f350 小跳");
step(10, { left: true }); snap("f360");
step(20); snap("f380 落B顶?");
step(30); snap("f410 压住30f");
step(60); snap("f470 压住90f g5 ON?");

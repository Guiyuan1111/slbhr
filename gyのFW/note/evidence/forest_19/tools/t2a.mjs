// r19c t2a：wg 东行→坡帘→角位 逐帧勘定（fb 走 seg1 压 B 并行）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_19");
const M = w.mechanisms;
let curF = 0;
const step = (n, fbIn = {}, wgIn = {}) => { for (let i = 0; i < n; i++) { w.step(1 / 60, { fireboy: fbIn, watergirl: wgIn }); curF++; } };
const snap = (tag) => {
  const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
  console.log(`[${tag}] f=${curF} fb=(${fb.x.toFixed(1)},${fb.y.toFixed(1)}) wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)})${wg.dying ? " DYING" : ""}${wg.dead ? " DEAD" : ""} g5=${M.pushers[1].state}`);
};
// fb seg1（t1 已锁帧）——后台并行
const fbSeq = [
  [10, 3], [32, 0], [33, 2], [93, 2], [153, 3], [243, 2], [273, 3], [285, 2], [310, 3], [316, 2], [341, 3], [349, 0], [350, 2], [360, 2],
];
// dir: 0=left+up 1=right 2=none 3=left —— 简化：直接手写逐步
snap("f0");
step(10); snap("f10");
step(22, { left: true });
step(1, { left: true, up: true });
step(60, { left: true });
step(60);
step(90, { left: true });
step(30);
step(12, { left: true }); step(25); step(6, { left: true }); step(25);
step(8, { left: true });
step(1, { left: true, up: true });
step(10, { left: true });
step(20);
step(200); snap("fb 压B后稳定");
// —— 至此 curF 应为 550，fb 在 B 上，g5=1；开始 wg
console.log(`--- curF=${curF} 开始 wg 东行 ---`);
let last = "";
for (let i = 0; i < 160; i++) {
  step(1, {}, { right: true });
  const wg = w.snapshotPlayer("watergirl");
  const s = `wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)})`;
  if (s !== last) { console.log(`f${curF} ${s}`); last = s; }
  if (wg.dying || wg.dead) { console.log("WG DEAD"); process.exit(1); }
}
snap("wg 160f 东行后");

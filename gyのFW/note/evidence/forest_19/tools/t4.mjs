// r19c t4：E0 45°上坡可行？wg 出生台西缘 (192,192) 楔 向西走上 spawn 台 (0-160,y160)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_19");
let curF = 0;
const step = (n, wgIn = {}) => { for (let i = 0; i < n; i++) { w.step(1 / 60, { fireboy: {}, watergirl: wgIn }); curF++; } };
const snap = (tag) => { const wg = w.snapshotPlayer("watergirl"); console.log(`[${tag}] f=${curF} wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)})${wg.dying ? " DYING" : ""}`); };
step(30); snap("settle");
step(30, { right: true }); snap("东行至 y192 台");
step(30); snap("到位");
step(50, { left: true }); snap("西行爬楔上 y160 台?");  // (192,192)→(160,160) 45° 上坡
step(30); snap("站定检查");
step(30, { right: true }); step(50, { left: true }); snap("二次确认");

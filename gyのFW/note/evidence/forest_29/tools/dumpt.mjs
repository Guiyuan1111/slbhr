/**
 * r29b：wg 西行全轨迹 dump（每3帧）
 */
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const TOTAL = 200;
const st = { up: false, left: false, right: false };
const evs = [{ f: 10, dir: "left", type: "down" }];
const byF = new Map();
for (const e of evs) byF.set(e.f, [[e.dir, e.type === "down"]]);
const ins = [];
for (let f = 0; f < TOTAL; f++) {
  for (const [k, v] of byF.get(f) ?? []) st[k] = v;
  ins.push({ ...st });
}
const w = makeWorld("forest_29");
for (let f = 0; f < TOTAL; f++) {
  w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: ins[f] });
  const wg = w.snapshotPlayer("watergirl");
  if (f % 3 === 0 || f < 20) console.log(`f${f} wg(${+wg.x.toFixed(1)},${+wg.y.toFixed(1)}) grounded=${wg.grounded}`);
}

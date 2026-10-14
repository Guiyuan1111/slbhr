// r23b v24 probe: from f114 rest (400,555), test right-hold climb to hub floor vs down-slide.
// usage: node fb-v24.mjs T dir frames  (dir: right|left, hold from f310 for `frames`)
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 600, holdN = a[2] ?? 180;
const dir = process.argv[3] ?? "right";
const fb = [
  E(2, "left", "down"), E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"), E(90, "up", "down"), E(130, "up", "up"),
  E(200, "up", "down"), E(203, "up", "up"), E(200, "left", "down"), E(220, "left", "up"),
  E(310, dir, "down"), E(310 + holdN, dir, "up"),
];
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
let last = "";
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  last = `f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`;
  if (s.dead || s.dying) { console.log(`${last} DEAD`); process.exit(1); }
  if (f >= 300 && f % 5 === 0) console.log(last);
}
console.log(`END ${last}`);

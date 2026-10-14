// r23b fb v21: proven prefix to jam (f195), then observe west-slope descent from jam.
// usage: node fb-v21.mjs T [evF evDir evDur ...]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 400;
const fb = [
  E(2, "left", "down"), E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"), E(90, "up", "down"), E(130, "up", "up"),
  E(200, "up", "down"), E(203, "up", "up"), E(200, "left", "down"), E(220, "left", "up"),
];
for (let i = 1; i + 2 < a.length; i += 3) {
  fb.push(E(a[i], ["left","right","up"][a[i+1]] ?? "left", a[i+2] === 0 ? "down" : "up"));
}
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
let last = "";
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  const d = w.built.doors.fireboy;
  last = `f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)}`;
  if (s.dead || s.dying) { console.log(`${last} DEAD`); process.exit(1); }
  if (f >= 190) console.log(last);
  if (w.phase === "won") { console.log(`WON f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(0); }
}
console.log(`END ${last}`);

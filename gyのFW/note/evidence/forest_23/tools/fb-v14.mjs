// r23b fb v14: cover plate (1177,352) -> fulljump LEFT with timed release -> clear water west edge -> door plate (992-1120,512).
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 700;
const jL = a[1] ?? 430, lRel = a[2] ?? 442, uRel = a[3] ?? 475;
const rP = a[4] ?? 520, rPe = a[5] ?? 545;
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(248, "up", "down"), E(278, "up", "up"),
  E(285, "right", "up"),
  E(310, "right", "down"),
  E(320, "up", "down"), E(365, "up", "up"),
  E(400, "right", "up"),
  E(jL, "left", "down"), E(lRel, "left", "up"),
  E(jL, "up", "down"), E(uRel, "up", "up"),
  E(rP, "right", "down"), E(rPe, "right", "up"),
];
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
let last = "";
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  const d = w.built.doors.fireboy;
  last = `f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)}`;
  if (s.dead || s.dying) { console.log(`${last} DEAD`); process.exit(1); }
  if (f % 10 === 0) console.log(`${last}${w.phase === "won" ? " WON" : ""}`);
  if (w.phase === "won") { console.log(`WON f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(0); }
}
console.log(`END ${last}`);

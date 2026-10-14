// r23b fb v15b: staircase foot -> run west + jump at block west edge -> goo9 plate (288)
//  -> creep west -> walk-off descend staircase terraces -> hub floor -> hub jump -> deck/lever
// usage: node --import tsx TEMP/r23b/fb-v15.mjs T brk lDn jW uRl lRl c1 c2 c3 c4 hDn hJ hRl
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 900;
const brk = a[1] ?? 245;   // right release on staircase
const lDn = a[2] ?? 312;   // start running west from rest (764,288)
const jW = a[3] ?? 322;    // jump while running west
const uRl = a[4] ?? 352;   // up release (fulljump)
const lRl = a[5] ?? 368;   // left release (after plate landing ~f364)
const c1 = a[6] ?? 385, c2 = a[7] ?? 397;  // creep taps toward plate edge 480
const c3 = a[8] ?? 405, c4 = a[9] ?? 412;
const hDn = a[10] ?? 520;  // hub floor: walk east
const hJ = a[11] ?? 545;   // hub jump up
const hRl = a[12] ?? 575;

const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(brk, "right", "up"),
  E(lDn, "left", "down"), E(jW, "up", "down"), E(uRl, "up", "up"), E(lRl, "left", "up"),
  E(c1, "left", "down"), E(c2, "left", "up"),
  E(c3, "left", "down"), E(c4, "left", "up"),
  E(hDn, "right", "down"), E(hJ, "up", "down"), E(hRl, "up", "up"),
];
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
let last = "";
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  const d = w.built.doors.fireboy;
  const lv = w.mechs.levers[0];
  last = `f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)} lv=${lv.state}`;
  if (s.dead || s.dying) { console.log(`${last} DEAD`); process.exit(1); }
  if (f % 10 === 0) console.log(`${last}${w.phase === "won" ? " WON" : ""}`);
  if (w.phase === "won") { console.log(`WON f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(0); }
}
console.log(`END ${last}`);

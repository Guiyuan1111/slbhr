// r23b fb v16: foot -> plateau (950,160) -> walk west off plateau west edge (896)
//  -> drop to lava rack / bump (~850-890, 448-480, fb lava-immune) -> walk west -> wedge climb -> deck
//  -> lever flip -> east on deck -> rack -> walk-off east end (864,480) -> fall to east floor (864)
// usage: node --import tsx TEMP/r23b/fb-v16.mjs T c1 c2 c3 c4 c5 c6 [more taps...]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 1200;
// plateau walk-west taps (each [down,up] pair)
const taps = [];
for (let i = 1; i + 1 < a.length; i += 2) taps.push([a[i], a[i + 1]]);

const fb = [
  // v24 prefix -> staircase foot (764,289)
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  // v11: fulljump east over 高台 -> land 160-plateau west (950,160), right held 135-285
  E(248, "up", "down"), E(278, "up", "up"), E(285, "right", "up"),
];
// wait for rest on plateau, then walk-west taps toward west edge (896)
let f0 = 430;
for (const [d, u] of taps) { fb.push(E(f0 + d, "left", "down"), E(f0 + u, "left", "up")); }
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

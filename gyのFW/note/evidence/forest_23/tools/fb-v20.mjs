// r23b fb v20: NEW clean route.
// A: spawn -> wall-slide west -> water13 rim (f90, proven) -> run east across sunken basin top (dry)
//    -> launch off east rim (224,416) -> fall -> LAND 768-step [416,512]@768 (~453,768)
// B: air-release to slow, settle; tap west to ~455
// C: fulljump east -> arc grazes over stack column top -> LAND bottom step [640,768]@864 (~751,864)
// E: pit fulljump -> east floor [960,1120]@864
// usage: node fb-v20.mjs T [relF] [tapF] [jF] ...
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 400;
const relF = a[1] ?? 150;      // release right mid-fall (slow before 768-step touchdown)
const tapW = a[2] ?? 210;      // west tap frame (after settle)
const tapWN = a[3] ?? 6;       // west tap length
const jC = a[4] ?? 240;        // C fulljump frame (from 768-step)
const brc = a[5] ?? 285;       // brake after C landing (bottom step)
const creep = a[6] ?? 310;     // creep east to step tip
const creepN = a[7] ?? 6;      // creep length
const jE = a[8] ?? 330;        // E pit fulljump frame
const fb = [
  E(2, "left", "down"), E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"),
  E(relF, "right", "up"),
  E(tapW, "left", "down"), E(tapW + tapWN, "left", "up"),
  E(jC, "right", "down"), E(jC, "up", "down"), E(jC + 3, "up", "up"),
  E(brc, "right", "up"),
  E(creep, "right", "down"), E(creep + creepN, "right", "up"),
  E(jE, "right", "down"), E(jE, "up", "down"), E(jE + 3, "up", "up"),
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
  if (f % 5 === 0) console.log(`${last}${w.phase === "won" ? " WON" : ""}`);
  if (w.phase === "won") { console.log(`WON f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(0); }
}
console.log(`END ${last}`);

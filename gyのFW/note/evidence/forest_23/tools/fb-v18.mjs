// r23b fb v18 FULL CHAIN:
//  A [proven fb-flow] spawn -> west -> pocket jam (464,429) f195
//  B walk west down staircase terraces (416/448/480/512) -> hub floor (544)
//  C walk east to x0~515-545 -> hub jump fulljump east -> deck (628,448) + lever flip
//  D walk east on deck -> slope (736,448)->(768,480) -> lava rack -> walk off east end (864)
//    -> fall -> east floor (864)
//  E walk east -> SE slope climb -> SE top (768) -> platform[1] sunk (768) -> jump up fix15 (670)
//    -> climb wedge -> top platform (580) -> fulljump WEST -> door plate band (1040-1104@512) -> WIN
// usage: node --import tsx TEMP/r23b/fb-v18.mjs T [f,dir,dur ...]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2);
const T = Number(a[0] ?? 2000);
const evs = [];
for (let i = 1; i + 1 < a.length; i += 3) evs.push(E(Number(a[i]), a[i + 1], a[i + 2]));

const fb = [
  // A: proven fb-flow -> pocket jam (464,429) ~f195
  E(2, "left", "down"), E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"), E(90, "up", "down"), E(130, "up", "up"),
  ...evs,
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

// r23b fb v17: prefix -> plateau -> cover plate (proven) -> climb wedge east -> tower top (1216,320)
//  -> walk off tower east edge -> fall east face -> bottom floor (896)
//  -> fulljump WEST onto east floor (864) -> walk east -> SE slope climb -> SE top (768)
//  -> jump +92 onto platform[1] (676, no-flip entry TEST) -> fix15 wedge climb -> top platform (580)
//  -> fulljump WEST -> door plate (992-1120@512) -> door band dwell -> WIN
// usage: node --import tsx TEMP/r23b/fb-v17.mjs T [evs as f,dir,down/up ...]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2);
const T = Number(a[0] ?? 1600);
const evs = [];
for (let i = 1; i + 1 < a.length; i += 3) evs.push(E(Number(a[i]), a[i + 1], a[i + 2]));

const fb = [
  // prefix (proven): spawn -> plateau (950,160)
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(248, "up", "down"), E(278, "up", "up"), E(285, "right", "up"),
  // plateau -> cover plate root (1181,352) [v14 proven]
  E(310, "right", "down"), E(320, "up", "down"), E(365, "up", "up"), E(400, "right", "up"),
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

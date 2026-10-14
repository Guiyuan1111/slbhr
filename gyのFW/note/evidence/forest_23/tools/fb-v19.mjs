// r23b fb v19 FULL CHAIN (no-mech variant):
//  A [proven] spawn -> west -> terrace (311,352) ~f130
//  B walk west off terrace -> tower/736-step -> 704-top -> wedge -> 832-floor
//  C fulljump east -> 768-step (x416-512) -> walk off -> plat2 catch (802)
//  D fulljump east from plat2 west end -> stack top (x640-672@736)
//  E fulljump east from stack top -> goo27 plate / east floor (~940,864)
//  F walk east -> SE slope climb -> SE top (768) -> +92 jump -> platform[1] (676)
//    -> step to fix15 (672) -> wedge climb -> top platform (580)
//  G fulljump WEST -> door plate (992-1120@512) -> band dwell -> WIN
// usage: node --import tsx TEMP/r23b/fb-v19.mjs T [f,dir,dur ...]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2);
const T = Number(a[0] ?? 2200);
const evs = [];
for (let i = 1; i + 1 < a.length; i += 3) evs.push(E(Number(a[i]), a[i + 1], a[i + 2]));

const fb = [
  // A: proven fb-flow -> terrace (311,352)
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

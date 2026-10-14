// r23b fb v13: plate (1181,352) -> tap-hop+right onto step (1212,324) -> walk off west edge
//  -> top platform (1184,576) -> drift west -> fulljump-left vx~230 -> door band.
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 760;
const hop = a[1] ?? 428;       // up down (tap 3f), right pressed 425-465
const wd = a[2] ?? 475;        // left down (walk off step west edge)
const wde = a[3] ?? 487;       // left up
const drift = a[4] ?? 505;     // left down (drift west on top platform)
const drifte = a[5] ?? 513;    // left up
const jL = a[6] ?? 527;        // fulljump left (hold), left held since drift? re-press:
const jLrel = a[7] ?? 543;     // left release (vx ~-230)
const rP = a[8] ?? 590;        // right nudge into band
const rPe = a[9] ?? 612;
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
  E(424, "right", "down"),
  E(hop, "up", "down"), E(hop + 3, "up", "up"),
  E(498, "right", "up"),
  E(wd, "left", "down"), E(wde, "left", "up"),
  E(drift, "left", "down"), E(drifte, "left", "up"),
  E(jL, "left", "down"), E(jLrel, "left", "up"),
  E(jL, "up", "down"), E(jL + 45, "up", "up"),
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

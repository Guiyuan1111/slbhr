// r23b fb v11 full chain: prefix -> j1 jump to 160-plateau -> big jump to cover-plate wall root
//  -> climb step -> drop west edge -> top platform -> fulljump-left -> door band -> PARK.
// usage: node --import tsx TEMP/r23b/fb-v11.mjs [T j2 rel2 j3 rel3 ...]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const T = Number(process.argv[2] ?? 900);
const j2 = Number(process.argv[3] ?? 248);   // staircase jump
const rel2 = Number(process.argv[4] ?? 285); // right release (air brake)
const j3 = Number(process.argv[5] ?? 330);   // big jump east from plateau
const rel3 = Number(process.argv[6] ?? 388); // right release after wall slide
const wS = Number(process.argv[7] ?? 405);   // west nudge to step face
const hop = Number(process.argv[8] ?? 425);  // hop onto step
const wD = Number(process.argv[9] ?? 475);   // west walk off step edge
const jL = Number(process.argv[10] ?? 540);  // fulljump left from top platform
const relL = Number(process.argv[11] ?? 572);// left release mid-flight
const rP = Number(process.argv[12] ?? 620);  // right walk into door band
const rPend = Number(process.argv[13] ?? 650);
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(j2, "up", "down"), E(j2 + 30, "up", "up"),
  E(rel2, "right", "up"),
  E(j3, "up", "down"), E(j3 + 45, "up", "up"),
  E(rel3, "right", "up"),
  E(wS, "left", "down"), E(wS + 5, "left", "up"),
  E(hop, "right", "down"), E(hop + 3, "up", "down"), E(hop + 33, "up", "up"),
  E(wD, "left", "down"), E(wD + 10, "left", "up"),
  E(jL, "up", "down"), E(jL + 45, "up", "up"),
  E(jL, "left", "down"), E(relL, "left", "up"),
  E(rP, "right", "down"), E(rPend, "right", "up"),
];
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  const d = w.built.doors.fireboy;
  if (s.dead || s.dying) { console.log(`f${f} DEAD (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(1); }
  if (f % 10 === 0 || f === T - 1) console.log(`f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)}${w.phase === "won" ? " WON" : ""}`);
  if (w.phase === "won") { console.log(`WON f${f}`); process.exit(0); }
}
console.log(`END (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`);

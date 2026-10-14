// r23b fb v12: prefix -> j2 (248, fullspeed) -> plateau (950,160) @f290 -> j3 (320, stand+right+fulljump)
//  -> cover plate wall root (~1196,352) @f385 -> hop step (1212,324) -> walk off west edge (1196)
//  -> top platform (~1184,576) -> drift west -> fulljump-left (vx~200) -> door band (1040-1104,512).
// usage: node --import tsx TEMP/r23b/fb-v12.mjs [j3 j3rel hop t1 t2 jL jLrel T]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const j3 = Number(process.argv[2] ?? 320), j3rel = Number(process.argv[3] ?? 400);
const hop = Number(process.argv[4] ?? 435);
const t1 = Number(process.argv[5] ?? 460), t2 = Number(process.argv[6] ?? 472); // west walk off step
const jL = Number(process.argv[7] ?? 545), jLrel = Number(process.argv[8] ?? 556);
const T = Number(process.argv[9] ?? 760);
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(248, "up", "down"), E(278, "up", "up"),
  E(285, "right", "up"),
  E(310, "right", "down"),
  E(j3, "up", "down"), E(j3 + 45, "up", "up"),
  E(j3rel, "right", "up"),
  E(hop, "up", "down"), E(hop + 30, "up", "up"),     // hop onto step (right still held? released at j3rel) -> re-press:
  E(hop - 5, "right", "down"), E(hop + 40, "right", "up"),
  E(t1, "left", "down"), E(t2, "left", "up"),
  E(jL, "left", "down"),
  E(jL, "up", "down"), E(jL + 45, "up", "up"),
  E(jLrel, "left", "up"),
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

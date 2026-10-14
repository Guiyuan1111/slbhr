// r23b v8: prefix -> staircase foot (790,263) -> walk west off edge -> vertical drop to rack(480)
//  -> east walk over lava(rack, fb immune) -> hop onto bump (880-896@449) -> walk-off east edge
//  -> drop to massif top (576/551) -> hop pedestal (992,512) -> walk into door band (1040-1104)
// usage: node --import tsx TEMP/r23b/v8.mjs [T] [wL] [durL] [rE] [jB] [rE2] [jP] [park]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 900;
const wL = a[1] ?? 260;    // left down (walk west off staircase-foot edge)
const durL = a[2] ?? 8;    // frames of left
const rE = a[3] ?? 330;    // right down (walk east on rack, after landing+settle)
const jB = a[4] ?? 560;    // up down (hop onto bump)
const rE2 = a[5] ?? 700;   // (unused placeholder for phase-2 right)
const jP = a[6] ?? 760;    // up down (jump pedestal)
const park = a[7] ?? 850;  // right up (park)
const fb = [
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  E(brk(), "right", "up"),
  E(wL, "left", "down"), E(wL + durL, "left", "up"),
  E(rE, "right", "down"),
  E(jB, "up", "down"), E(jB + 3, "up", "up"),
  E(rE2, "right", "up"),
  E(jP, "up", "down"), E(jP + 12, "up", "up"),
  E(park, "right", "up"),
];
function brk() { return 245; }
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  const d = w.built.doors.fireboy;
  if (s.dead || s.dying) { console.log(`DEAD f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) vx=${s.vx.toFixed(0)}`); process.exit(1); }
  if (f % 10 === 0 || f === T - 1) console.log(`f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) vx=${s.vx.toFixed(0)} vy=${s.vy.toFixed(0)} door=${d.frac.toFixed(1)}${w.phase === "won" ? " WON" : ""}`);
  if (w.phase === "won") { console.log(`WON f${f}`); process.exit(0); }
}

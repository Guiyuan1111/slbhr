// r23b fb v26: THE COMPLETE ROUTE.
// A: prefix (proven) -> rest (786,267) on f183 hyp at f240
// B: walk WEST down staircase (f183/f177/f172 -> f161 tower -> wall-slide) -> DECK (700,448)
// C: walk west -> LEVER flip (~640,448) -> plat1 sinks
// D: walk east across deck -> f134 ramp -> rack (lava, fb immune) -> walk-off (864,480) -> fall -> east floor
// E: SE slope crawl -> SE flat (1088,768); walk east over SUNK pillar
// F: standing tap-jump up-east -> f73 hyp (672) -> crawl f73/f86/f98 -> 顶台 (576)
// G: fulljump west -> DOOR PLATE (512) -> band dwell
// usage: node fb-v26.mjs T [wOff wTo lvr lvrEnd goR goBr sUp sCr tBr jW]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const P = (i, d) => (a[i] ?? d);
const T = a[0] ?? 1100;
const wOff = P(1, 250);      // west walk start (staircase descent)
const lvr = P(2, 300);       // arrive lever; keep left until lvrEnd
const lvrEnd = P(3, 322);    // left release
const goR = P(4, 328);       // right walk east (deck -> rack -> walk-off)
const goBr = P(5, 355);      // release right mid-fall from rack (brake drift)
const sUp = P(6, 600);       // release right on SE flat (stop)
const sCr = P(7, 625);       // stand tap-jump: right 2f
const sCr2 = P(8, 627);      // right release after tap
const jF = P(9, 625);        // up press frame
const cR = P(10, 640);       // crawl right resume (f73 -> 顶台)
const tBr = P(11, 750);      // 顶台 stop
const jW = P(12, 780);       // west fulljump
const fb = [
  // A: proven prefix
  E(3, "right", "down"), E(40, "right", "up"), E(60, "right", "down"), E(88, "right", "up"),
  E(130, "up", "down"), E(133, "up", "up"),
  E(135, "right", "down"),
  E(196, "up", "down"), E(199, "up", "up"),
  // B: (no f248 jump!) land (786,267), walk west down staircase
  E(wOff, "left", "down"),
  E(lvrEnd, "left", "up"),
  // D: east across deck/rack
  E(goR, "right", "down"), E(goBr, "right", "up"),
  // E: SE crawl
  E(goBr + 5, "right", "down"), E(sUp, "right", "up"),
  // F: standing tap-jump + crawl
  E(sCr, "right", "down"), E(sCr2, "right", "up"),
  E(jF, "up", "down"), E(jF + 3, "up", "up"),
  E(cR, "right", "down"), E(tBr, "right", "up"),
  // G: west fulljump
  E(jW, "left", "down"), E(jW, "up", "down"), E(jW + 3, "up", "up"),
];
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
let last = "";
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  const d = w.built.doors.fireboy;
  last = `f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)}`;
  if (s.dead || s.dying) { console.log(`${last} DEAD`); process.exit(1); }
  if (f % 5 === 0) console.log(last);
  if (w.phase === "won") { console.log(`WON f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(0); }
}
console.log(`END ${last}`);

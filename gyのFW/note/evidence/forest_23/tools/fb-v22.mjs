// r23b fb v22: full route attempt.
// A: proven prefix -> jam (f195)
// B: fulljump west (left held 15-22f then release) -> land west-tilting wedge (384-416,544-576)
//    -> slide off west toe (384,576) -> clean drop -> 832-floor [288,384]@832
// C: fulljump east -> 768-step [416,512]@768
// D: creep west to ~445; E: fulljump east -> stack corner graze -> stack top or bottom step
// F: bottom step -> creep to east tip -> G: pit fulljump -> east floor [960,1120]@864
// H: SE slope crawl -> SE top (1084,768); I: up-jump + skid -> fix15 wedge/pillar (672)
// K: wedge crawl -> 顶台 (1180-1220@580); M: fulljump west -> door plate (512) band
// usage: node fb-v22.mjs T
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const T = a[0] ?? 1000;
const jbL = a[1] ?? 200, jbRel = a[2] ?? 220;   // B jump frame, left release
const jc = a[3] ?? 330;                          // C fulljump from 832-floor
const cbr = a[4] ?? 388;                         // brake on 768-step
const w1 = a[5] ?? 400, w2 = a[6] ?? 404;        // west tap 1
const w3 = a[7] ?? 410, w4 = a[8] ?? 414;        // west tap 2
const jd = a[9] ?? 430;                          // D fulljump east (corner graze)
const sOff = a[10] ?? 480, sBrk = a[11] ?? 510;  // stack walk-off / brake
const e1 = a[12] ?? 530, e2 = a[13] ?? 535;      // creep east
const jE = a[14] ?? 550;                         // G pit fulljump
const ebr = a[15] ?? 610;                        // brake on east floor
const sUp = a[16] ?? 780, sk1 = a[17] ?? 800, sk2 = a[18] ?? 805; // SE stop / up-jump / skid
const tbr = a[19] ?? 900;                        // 顶台 stop
const jW = a[20] ?? 930;                         // M west fulljump
const fb = [
  // A: proven to jam
  E(2, "left", "down"), E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"), E(90, "up", "down"), E(130, "up", "up"),
  // B: fulljump west from jam, land west-tilting wedge
  E(jbL, "up", "down"), E(jbL + 3, "up", "up"), E(jbL, "left", "down"), E(jbRel, "left", "up"),
  // C: fulljump east from 832-floor
  E(jc, "right", "down"), E(jc, "up", "down"), E(jc + 3, "up", "up"),
  E(cbr, "right", "up"),
  // D: reposition west taps
  E(w1, "left", "down"), E(w2, "left", "up"), E(w3, "left", "down"), E(w4, "left", "up"),
  // E: fulljump east -> corner graze
  E(jd, "right", "down"), E(jd, "up", "down"), E(jd + 3, "up", "up"),
  E(sOff, "right", "up"),
  // F: creep east on bottom step
  E(e1, "right", "down"), E(e2, "right", "up"),
  // G: pit fulljump
  E(jE, "right", "down"), E(jE, "up", "down"), E(jE + 3, "up", "up"),
  E(ebr, "right", "up"),
  // I: up-jump + skid at pillar
  E(sk1, "right", "down"), E(sk2, "right", "up"),
  E(sUp, "up", "down"), E(sUp + 3, "up", "up"),
  // M: west fulljump from 顶台
  E(tbr, "right", "up"),
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

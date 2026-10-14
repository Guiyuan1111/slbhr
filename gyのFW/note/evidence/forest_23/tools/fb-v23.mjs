// r23b fb v23: full route, parameterized.
// A proven->jam f195 | B west-jump->self-land wedge (400,555) f~295 | C 1f tap -> slide off toe -> 832-floor
// D fulljump east -> 768-step | E creep west ~442 | F corner-graze jump -> stack top (670,736)
// G walk east off stack -> bottom step (690,864) | H creep to ~755 | I pit fulljump -> east floor
// J brake | K SE crawl | L up-jump+skid -> fix15 wedge | M wedge crawl -> 顶台 | N west jump -> door plate
// usage: node fb-v23.mjs T [tapoff cJ cbr w1 w2 w3 w4 grd gbr off1 brk1 cr1 cr2 cr3 cr4 pj pbr kStop sk1 sk2 mCrawl mStop jW]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const P = (i, d) => (a[i] ?? d);
const T = a[0] ?? 1200;
const tapoff = P(1, 310);            // wedge tap-off frame (1f left)
const cJ = P(2, 370);                // fulljump east from 832-floor
const cbr = P(3, 430);               // brake on 768-step
const w1 = P(4, 440), w2 = P(5, 444);
const w3 = P(6, 450), w4 = P(7, 454);
const grd = P(8, 465);               // corner-graze fulljump east
const gbr = P(9, 540);               // brake after bottom-step landing
const cr1 = P(10, 560), cr2 = P(11, 567);
const cr3 = P(12, 575), cr4 = P(13, 582);
const pj = P(14, 592);               // pit fulljump
const pbr = P(15, 655);              // brake on east floor
const kStop = P(16, 860);            // SE crawl stop
const sk1 = P(17, 880), sk2 = P(18, 885); // skid window
const mStop = P(19, 1000);           // fix15 crawl stop
const jW = P(20, 1020);              // west fulljump from 顶台
const fb = [
  E(2, "left", "down"), E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
  E(70, "right", "down"), E(90, "up", "down"), E(130, "up", "up"),
  E(200, "up", "down"), E(203, "up", "up"), E(200, "left", "down"), E(220, "left", "up"),
  E(tapoff, "left", "down"), E(tapoff + 1, "left", "up"),
  E(cJ, "right", "down"), E(cJ, "up", "down"), E(cJ + 3, "up", "up"),
  E(cbr, "right", "up"),
  E(w1, "left", "down"), E(w2, "left", "up"), E(w3, "left", "down"), E(w4, "left", "up"),
  E(grd, "right", "down"), E(grd, "up", "down"), E(grd + 3, "up", "up"),
  E(gbr, "right", "up"),
  E(cr1, "right", "down"), E(cr2, "right", "up"),
  E(cr3, "right", "down"), E(cr4, "right", "up"),
  E(pj, "right", "down"), E(pj, "up", "down"), E(pj + 3, "up", "up"),
  E(pbr, "right", "up"),
  E(kStop + 20, "right", "down"), E(sk1, "right", "up"),
  E(sUp(), "up", "down"), E(sUp() + 3, "up", "up"),
  E(mStop, "right", "up"),
  E(jW, "left", "down"), E(jW, "up", "down"), E(jW + 3, "up", "up"),
];
function sUp() { return P(21, sk1 + 5); }
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

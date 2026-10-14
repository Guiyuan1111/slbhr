// r23b wg v27: WG complete route.
// A: spawn -> west wall-slide -> water13 rim (~f90, shifted for wg spawn)
// B: NO jump - walk west off rim into pool (immune) -> pool floor (432)
// C: walk east -> climb east wedge (182,432)->(224,416) -> out at (224,416)
// D: walk east off -> fall 352 -> LAND 768-step (~453,768)
// E: brake; fulljump east -> stack top (668,736) [crush ok] -> walk east off -> bottom step (690,864)
// F: creep east (758,864) -> pit fulljump -> east floor (963,864)
// G: walk east -> SE slope west face -> crawl up -> crest apex (1084,772) -> drop east face -> (1090,864)
// H: walk east off (1120,864) -> fall -> bottom floor -> WG BAND [1136,1200]x[896,904] -> dwell
// usage: node wg-v36.mjs T [rimJumpF outE brk crep1 crep2 pj pbr crawlTo]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const a = process.argv.slice(2).map(Number);
const P = (i, d) => (a[i] ?? d);
const T = a[0] ?? 900;
const brk = P(1, 200);       // brake after 768-step landing
const crep1 = P(2, 215);     // west tap to reposition
const crep2 = P(3, 219);
const jS = P(4, 230);        // stack fulljump east from 768-step
const sOff = P(5, 290);      // (hold right: auto walk-off stack -> bottom step)
const b2 = P(6, 305);        // brake on bottom step
const cr1 = P(7, 330), cr2 = P(8, 337);   // creep east
const pj = P(9, 350);        // pit fulljump
const pbr = P(10, 415);      // brake on east floor
const crawlTo = P(11, 560);  // SE slope crawl hold-right until
const wg = [
  // S1+S2: spawn -> b18 pool -> rim vault -> terrace overshoot -> JAM (proven)
  E(2, 'left', 'down'), E(10, 'up', 'down'), E(50, 'up', 'up'), E(50, 'left', 'up'),
  E(70, 'right', 'down'), E(92, 'right', 'up'), E(120, 'right', 'down'),
  // S3: jam climb-jump east (boost carries to [736,800]@352)
  E(330, 'up', 'down'), E(333, 'up', 'up'),
  // S4-S5: hold right; walk off 800 -> wedge catch -> crest -> release -> podium
  E(434, 'right', 'up'),
  // F: podium east, wall-bonk fulljump -> [1184,1248]@576 slab
  E(480, 'up', 'down'), E(483, 'up', 'up'),
  // G: release -> cascade slide -> stairs -> east floor
  E(540, 'right', 'up'),
  // H: run east floor -> off 1120 -> band; stop at wall
  E(640, 'right', 'down'), E(730, 'right', 'up'),
];
const ins = expandFlat([], wg, T);
const w = makeWorld("forest_23");
let last = "";
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("watergirl");
  const d = w.built.doors.watergirl;
  last = `f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)}`;
  if (s.dead || s.dying) { console.log(`${last} DEAD`); process.exit(1); }
  if (f % 5 === 0) console.log(last);
  if (w.phase === "won") { console.log(`WON f${f} (${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`); process.exit(0); }
}
console.log(`END ${last}`);

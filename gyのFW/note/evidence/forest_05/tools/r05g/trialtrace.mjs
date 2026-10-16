// trialtrace: 抖动回放指定 trial，输出 wg/fb 关键帧轨迹
import { makeWorld, expandFlat } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { readFileSync } from "node:fs";

const doc = JSON.parse(readFileSync(new URL("../r05g2/f05-holdgo.json", import.meta.url), "utf8"));
const SEED = Number(process.argv[2] ?? 42);
const TRIAL = Number(process.argv[3] ?? 0);
const F0 = Number(process.argv[4] ?? 1150);
const F1 = Number(process.argv[5] ?? 1500);

for (let i = 0; i <= TRIAL; i++) {
  let s = SEED >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const slip = () => { const r = rand(); return r < 0.02 ? 1 : r < 0.026 ? 2 : r < 0.028 ? 3 : 0; };
  const j1 = (arr) => arr.map(e => { const d = slip(); return d ? { ...e, f: e.f + d } : e; }).sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
  var fbj = j1(doc.fb), wgj = j1(doc.wg);
  var docJ = { ...doc, fb: fbj, wg: wgj };
}
const ins = expandFlat(docJ.fb, docJ.wg, doc.totalFrames);
const w = makeWorld("forest_05");
let lastWgY = 0;
for (let f = 0; f < doc.totalFrames; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const wg = w.snapshotPlayer("watergirl"), fb = w.snapshotPlayer("fireboy");
  if (lastWgY <= 700 && wg.y > 700) console.log(`f${f} wg DROPPED>700 at x=${wg.x.toFixed(1)}`);
  if (lastWgY <= 800 && wg.y > 800) console.log(`f${f} wg DROPPED>800 at x=${wg.x.toFixed(1)}`);
  lastWgY = wg.y;
  if (f >= F0 && f <= F1 && f % 10 === 0) console.log(`f${f} wg=(${wg.x.toFixed(0)},${wg.y.toFixed(0)}) fb=(${fb.x.toFixed(0)},${fb.y.toFixed(0)})`);
  if (fb.dead || wg.dead) { console.log(`DEATH f${f}`); break; }
  if (w.phase === "won") { console.log(`WON f${f}`); break; }
  if (f === doc.totalFrames - 1) console.log(`STALL fb=(${fb.x.toFixed(1)},${fb.y.toFixed(1)}) wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)})`);
}

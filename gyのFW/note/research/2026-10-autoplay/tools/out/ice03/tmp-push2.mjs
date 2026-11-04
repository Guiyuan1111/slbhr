import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const auto = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/autosearch.mjs")).href);
const world = kernel.makeWorld("ice_03");
const jd = (d,h) => ({n:"jumpDrift",a:[d,0,h]});
const wt = (d,x,v) => ({n:"walkTo",a:v?[d,x,v]:[d,x]});
const wgProg = [
  {n:"sleep",a:[3]}, wt(-1,1075,70), jd(-1,40), jd(-1,20),
  wt(-1,780,60), wt(-1,465,70), {n:"hold",a:[1,545]},
];
const toFrames = (prog) => {
  const fr = [];
  for (const p of prog) {
    const prim = auto.PRIM_TABLE[p.n];
    const got = prim(p.a);          // → 帧数组（推测）
    for (const f of got) fr.push(f);
  }
  return fr;
};
let frames;
try { frames = toFrames(wgProg); } catch (e) { console.log("PRIM_TABLE direct failed:", e.message); frames = null; }
if (!frames) { console.log("PRIM_TABLE keys:", Object.keys(auto.PRIM_TABLE ?? {})); }
if (frames) {
  const IN = {up:false,left:false,right:false};
  let f = 0;
  for (const inp of frames) {
    world.step(1/60, { fireboy: IN, watergirl: inp }); f++;
    if (f % 20 === 0) {
      const M = world.mechSnapshot();
      const wg = world.snapshotPlayer("watergirl");
      console.log(`f${f} wg=${wg.x.toFixed(1)} sl.x=${M.sliders[0].x.toFixed(1)} frozen=${JSON.stringify(M.liquidsFrozen)}`);
    }
  }
  console.log("total frames:", frames.length, "last input:", JSON.stringify(frames[frames.length-1]));
}

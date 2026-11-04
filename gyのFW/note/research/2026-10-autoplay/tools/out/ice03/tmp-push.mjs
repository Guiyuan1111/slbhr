import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const world = kernel.makeWorld("ice_03");
const IN = { up:false, left:false, right:false };
const L = { up:false, left:true, right:false };
const R = { up:true, left:true, right:false };
const seq = [];
const push = (arr, n, inp) => { for (let i=0;i<n;i++) arr.push(inp); };
push(seq,3,IN); push(seq,70,L);            // walkTo -1 1075 70
push(seq,40,R);                            // jd -1 40
push(seq,20,R);                            // jd -1 20
const wt = (n) => { for (let i=0;i<n;i++) seq.push(L); };  // walkTo west
const f1 = seq.length;
wt(300);                                    // walkTo -1 780 (≈60px/s over ~300px→300f)
wt(350);                                    // walkTo -1 465
let f = 0;
const log = (tag) => {
  const M = world.mechSnapshot();
  const wg = world.snapshotPlayer("watergirl");
  console.log(`${tag} f${f} wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)}) sl=${JSON.stringify(M.sliders)} frozen=${JSON.stringify(M.liquidsFrozen)} beam=${JSON.stringify(M.beamers[0].pts).slice(0,80)} mir=${JSON.stringify(M.infiniteMirrors.map(m=>+m.angle.toFixed(2)))}`);
};
for (const inp of seq) { world.step(1/60, { fireboy: IN, watergirl: inp }); f++; if (f%60===0) log("seq"); }
for (let i=0;i<360;i++) { world.step(1/60, { fireboy: IN, watergirl: {up:false,left:false,right:true} }); f++; if (f%30===0) log("HOLD-R"); }

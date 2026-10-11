// v17: fb 崖落→西行→楔尖(544,416)起跳越销→落岩浆池坡→涉池西行→西裙上→门地板
//      wg  崖…鞍跳→中央台→[right]东行链→544台→跳楔→门地板
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
function mk(evs, total) {
  const st = { up:false,left:false,right:false };
  const byF = new Map(); for (const [f,d,t] of evs) { if(!byF.has(f)) byF.set(f,[]); byF.get(f).push([d,!!t]); }
  const ins = []; for (let f=0;f<total;f++){ for (const [k,v] of byF.get(f)??[]) st[k]=v; ins.push({...st}); }
  return ins;
}
const TOTAL = 520;
const fbE = [
  [3,"right",1],
  [150,"right",0],
  [168,"left",1],       // 落裙西行
  [242,"up",1],[244,"up",0],   // 楔尖起跳（贴尖垂直+左漂，越销）
  [340,"left",0],       // 门地板刹停
];
const wgE = [
  [3,"left",1],
  [66,"left",0],
  [80,"left",1],
  [100,"up",1],[102,"up",0],   // 西坡跳→中央台 f176 (571,441)
  [178,"right",1],      // 东行链：裙→[608,640]→[672,736]→(736)落hyp→(768,480)→下hyp→544台
  [252,"up",1],[254,"up",0],   // 544台跳跃越楔→门地板
  [292,"right",0],
];
const fb = mk(fbE, TOTAL), wg = mk(wgE, TOTAL);
const w = makeWorld("forest_12_1");
const marks = new Set();
for (let f=170;f<TOTAL;f++) marks.add(f);
for (let f=0; f<TOTAL; f++) {
  w.step(1/60, { fireboy: fb[f], watergirl: wg[f] });
  const F = w.snapshotPlayer("fireboy"), G = w.snapshotPlayer("watergirl");
  if (marks.has(f) || F.dying || G.dying || w.phase!=="playing") {
    console.log(`f${String(f).padStart(3)} fb(${F.x.toFixed(1)},${(F.y+35.2).toFixed(1)},${F.vx.toFixed(0)}) wg(${G.x.toFixed(1)},${(G.y+35.2).toFixed(1)},${G.vx.toFixed(0)})` +
      ` d[fb${w.doors.fireboy.frac.toFixed(1)}${w.doors.fireboy.isUp?"^":""} wg${w.doors.watergirl.frac.toFixed(1)}${w.doors.watergirl.isUp?"^":""}]` +
      (F.dying?" FB-DY":"") + (G.dying?" WG-DY":"") + (w.phase!=="playing"?` PH=${w.phase}`:""));
    if (w.phase!=="playing") break;
  }
}

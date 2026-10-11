// v16: fb 崖前刹→越崖→裙→西行全程; wg 鞍上→西缘落hyp→东行链→楔跳→门地板
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
function mk(evs, total) {
  const st = { up:false,left:false,right:false };
  const byF = new Map(); for (const [f,d,t] of evs) { if(!byF.has(f)) byF.set(f,[]); byF.get(f).push([d,!!t]); }
  const ins = []; for (let f=0;f<total;f++){ for (const [k,v] of byF.get(f)??[]) st[k]=v; ins.push({...st}); }
  return ins;
}
const TOTAL = 480;
const fbE = [
  [3,"right",1],
  [150,"right",0],      // 东裙中段刹 → 缓行越崖(vx~40)
  [168,"left",1],       // 落448裙即西行: 上裙→448台→下西坡→512台→上西裙→门地板
  [283,"left",0],       // 门地板刹停入住区
];
const wgE = [
  [3,"left",1],
  [66,"left",0],        // 谷底刹停(928,288)
  [80,"left",1],
  [100,"up",1],[102,"up",0],   // 西坡跳→鞍上(795,224) f153
  [170,"left",1],       // 西行越鞍西缘(768) vx~70
  [196,"right",1],      // 落hyp(736-768)即东行: 上(768,480)→下hyp→544台
  [228,"up",1],[230,"up",0],   // 544台跳跃越楔→门地板
  [268,"right",0],
];
const fb = mk(fbE, TOTAL), wg = mk(wgE, TOTAL);
const w = makeWorld("forest_12_1");
const marks = new Set();
for (let f=148;f<TOTAL;f++) marks.add(f);
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

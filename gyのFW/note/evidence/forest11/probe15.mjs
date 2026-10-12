// r28b: 修正探测 —— P-A' 沟槽着陆 / P-B 544块跳 / P-C' 块上跳柱顶 / P-J wg塔A走离->384->柱顶->空腔->736slab / P-L fb 基座顶入水
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const D = { R:{up:false,left:false,right:true}, L:{up:false,left:true,right:false} };
function mk(){ const w=makeWorld("forest_11"); for(let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0}); return w; }
function tp(w,role,x,feet){ const m=w.chars[role==="fb"?"fireboy":role]; m.body.SetPosition({x:-x/32,y:-(feet-35.2)/32}); m.body.SetLinearVelocity({x:0,y:0}); }
const pos=(w,role)=>{ const s=w.snapshotPlayer(role==="fb"?"fireboy":role); return {x:s.x,feet:s.y+35.2,dead:!!(s.dead||s.dying)}; };
const seq=(d,t,k)=>{ const o=[{...D[d],up:true}]; for(let i=1;i<t;i++) o.push(ins0); for(let i=0;i<k;i++) o.push(D[d]); return o; };
const rseq=(d,pre,k)=>{ const o=[]; for(let i=0;i<pre;i++) o.push(D[d]); o.push({...D[d],up:true}); for(let i=0;i<k;i++) o.push(D[d]); return o; };
function run(role,x,feet,frames,marks,coast=90){
  const w=mk(); tp(w,role,x,feet); const out=[];
  for(let i=0;i<frames.length;i++){ w.step(DT, role==="fb"?{fireboy:frames[i],watergirl:ins0}:{fireboy:ins0,watergirl:frames[i]});
    if(marks.includes(i)){const s=pos(w,role);out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);} }
  for(let i=0;i<coast;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s=pos(w,role); return out.join(" ")+` END(${s.x.toFixed(0)},${s.feet.toFixed(0)})${s.dead?" DEAD":""}`;
}
console.log("== P-A' fb 736slab跳东上沟槽 k32/k40 ==");
for (const [sx,k] of [[1095,32],[1090,40]])
  console.log(`x${sx} k${k}:`, run("fb",sx,736,seq("R",1,k),[10,14,18,22,26,30,34],80));
console.log("== P-B fb 沟槽坡(1140/1150,~615) 跳东上544块 ==");
for (const [sx,sf,k] of [[1140,615,14],[1150,610,12],[1145,612,18]])
  console.log(`x${sx} f${sf} k${k}:`, run("fb",sx,sf,seq("R",1,k),[4,8,12,16,20],80));
console.log("== P-C' fb 544块(1160,544) rjL 跳西上柱顶 ==");
for (const [pre,k] of [[0,24],[8,24],[8,30]])
  console.log(`pre${pre} k${k}:`, run("fb",1160,544,rseq("L",pre,k),[8,14,18,22,26,30,36],90));
console.log("== P-J wg 塔A顶(902,352) 东行走离->384盒->柱顶->空腔->736slab ==");
console.log(run("watergirl",902,352,[...Array(14).fill(D.R)],[3,6,9,12,14,18,22,26],100));
console.log("== P-L fb 基座顶(935,672) 西行走离入水->游西->海滩 ==");
console.log(run("fb",935,672,[...Array(20).fill(D.L)],[3,6,9,12,16,20,30,40,50],50));

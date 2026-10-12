// r28b: 决定性三跳 —— P-A 736slab跳上沟槽 / P-C 沟槽跳西上柱顶 / P-D 海滩西缘掉800块 / P-E 920入水游西 / P-H wg塔肩跳
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const D = { R:{up:false,left:false,right:true}, L:{up:false,left:true,right:false} };
function mk(){ const w=makeWorld("forest_11"); for(let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0}); return w; }
function tp(w,role,x,feet){ const m=w.chars[role==="fb"?"fireboy":role]; m.body.SetPosition({x:-x/32,y:-(feet-35.2)/32}); m.body.SetLinearVelocity({x:0,y:0}); }
const pos=(w,role)=>{ const s=w.snapshotPlayer(role==="fb"?"fireboy":role); return {x:s.x,feet:s.y+35.2,dead:!!(s.dead||s.dying)}; };
const seq=(d,t,k)=>{ const o=[{...D[d],up:true}]; for(let i=1;i<t;i++) o.push(ins0); for(let i=0;i<k;i++) o.push(D[d]); return o; };
const rseq=(d,pre,k)=>{ const o=[]; for(let i=0;i<pre;i++) o.push(D[d]); o.push({...D[d],up:true}); for(let i=0;i<k;i++) o.push(D[d]); return o; };
function run(role,x,feet,frames,marks,coast=80){
  const w=mk(); tp(w,role,x,feet); const out=[];
  for(let i=0;i<frames.length;i++){ w.step(DT, role==="fb"?{fireboy:frames[i],watergirl:ins0}:{fireboy:ins0,watergirl:frames[i]});
    if(marks.includes(i)){const s=pos(w,role);out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);} }
  for(let i=0;i<coast;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s=pos(w,role); return out.join(" ")+` END(${s.x.toFixed(0)},${s.feet.toFixed(0)})${s.dead?" DEAD":""}`;
}
console.log("== P-A fb 736slab(1095/1105,736) 跳东上沟槽640 ==");
for (const [sx,k] of [[1095,20],[1105,16],[1095,26]])
  console.log(`x${sx} k${k}:`, run("fb",sx,736,seq("R",1,k),[6,10,14,18,22,28],70));
console.log("== P-C fb 沟槽(1130,640) 跳西上柱顶544 ==");
for (const [sx,k] of [[1130,20],[1130,26],[1120,24]])
  console.log(`x${sx} k${k}:`, run("fb",sx,640,seq("L",1,k),[6,10,14,18,22,26,32],80));
console.log("== P-D fb 海滩西缘(712,672) 西行走离掉800块 ==");
console.log(run("fb",712,672,[...Array(16).fill(D.L)],[4,8,12,16],80));
console.log("== P-E fb 从920,690 游西爬上海滩 ==");
console.log(run("fb",920,690,[...Array(60).fill(D.L)],[10,20,30,40,50,60],40));
console.log("== P-H wg 东块(1015,480) 塔肩跳上448slab东段 ==");
for (const k of [16,20])
  console.log(`k${k}:`, run("watergirl",1015,480,seq("R",1,k),[6,10,14,18,22,28],70));

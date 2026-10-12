// r28b: 修正探测 —— fb 800块长按东 / 池入口预跑跳 / 浮泳上滩 / 板升出口
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const D = { R:{up:false,left:false,right:true}, L:{up:false,left:true,right:false} };
function setup(role, x, feet) {
  const w = makeWorld("forest_11");
  for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const me = w.chars[role==="fb"?"fireboy":role];
  me.body.SetPosition({ x:-x/32, y:-(feet-35.2)/32 });
  me.body.SetLinearVelocity({ x:0, y:0 });
  return w;
}
function trace(role, x, feet, frames, marks, coast=100) {
  const w = setup(role, x, feet);
  const out=[];
  for (let i=0;i<frames.length;i++) {
    w.step(DT, role==="fb"?{fireboy:frames[i],watergirl:ins0}:{fireboy:ins0,watergirl:frames[i]});
    if (marks.includes(i)) { const s = w.snapshotPlayer(role==="fb"?"fireboy":role); out.push(`f${i}(${s.x.toFixed(0)},${(s.y+35.2).toFixed(0)})`); }
  }
  for (let i=0;i<coast;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s = w.snapshotPlayer(role==="fb"?"fireboy":role);
  return out.join(" ") + ` END(${s.x.toFixed(0)},${(s.y+35.2).toFixed(0)})${s.dead||s.dying?" DEAD":""}`;
}
const seq = (d, t, k) => { const out=[{...D[d],up:true}]; for(let i=1;i<t;i++) out.push(ins0); for(let i=0;i<k;i++) out.push(D[d]); return out; };
const rseq = (d, pre, k) => { const out=[]; for(let i=0;i<pre;i++) out.push(D[d]); out.push({...D[d],up:true}); for(let i=0;i<k;i++) out.push(D[d]); return out; };

console.log("== V1 fb 800块: k 长按变体 ==");
for (const k of [24, 28, 32])
  console.log(`rjR pre3 k${k}:`, trace("fb", 988, 896, rseq("R",3,k), [10,20,28,32], 60));
console.log("== V2 fb 池入口: 1125 预跑西跳 ==");
for (const k of [14, 16, 18, 20])
  console.log(`rjL pre8 k${k}:`, trace("fb", 1128, 736, rseq("L",8,k), [8,10,14,18,22,26,30], 60));
console.log("== V3 fb 池内浮西上滩 (落点~905) ==");
console.log(trace("fb", 1128, 736, [...rseq("L",8,18), ...Array(50).fill(D.L)], [26,32,40,50,60,66,72,78]));
console.log("== V4 wg 480slab->448slab 800 台 32 上 (滑升) ==");
console.log(trace("watergirl", 787, 480, [...seq("R",1,16)], [5,10,14,18,22,28], 40));

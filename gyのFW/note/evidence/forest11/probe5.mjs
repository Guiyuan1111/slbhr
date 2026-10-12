// r28b: fb 修正链探测 —— jl 上864板 / rr8j34 上736slab / 长预跑跳西入池 / 浮西上滩
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

console.log("== W1 fb spawn 跳西上 864板 ==");
for (const k of [10, 14, 18])
  console.log(`tjL t1 k${k}:`, trace("fb", 992, 896, seq("L",1,k), [6,10,14,18,22], 40));
console.log("== W2 fb 864板 rr8j34 上 736slab ==");
for (const [pre,k] of [[6,30],[8,30],[10,34]])
  console.log(`rjR pre${pre} k${k}:`, trace("fb", 944, 864, rseq("R",pre,k), [pre+4,pre+10,pre+16,pre+22,pre+30,pre+38], 40));
console.log("== W3 fb 736slab 东端长预跑跳西入池 ==");
for (const [pre,k] of [[14,20],[16,22],[18,24]])
  console.log(`rjL pre${pre} k${k}:`, trace("fb", 1120, 736, rseq("L",pre,k), [pre+2,pre+8,pre+14,pre+20,pre+28,pre+36], 60));
console.log("== W4 fb 池内(~916) 浮西 -> 海滩 ==");
console.log(trace("fb", 916, 700, [...Array(50).fill(D.L)], [8,16,24,32,40,48]));
console.log(trace("fb", 916, 690, [...Array(50).fill(D.L)], [8,16,24,32,40,48]));

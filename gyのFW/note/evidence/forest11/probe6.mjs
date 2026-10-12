// r28b: 收尾探测 —— W3 长按西 / W6 板出口 / W7 越井 / wg 448东跳+640块
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

console.log("== W3b 736slab 跳西 长按西 k 变体 ==");
for (const k of [36, 44, 52])
  console.log(`rjL pre18 k${k}:`, trace("fb", 1120, 736, rseq("L",18,k), [20,30,40,50,58], 60));
console.log("== W6 fb 板->沿->底板 (板已升模拟: 直接放 920,672) ==");
console.log(trace("fb", 920, 672, [...Array(10).fill(D.R)], [3,6,10], 80));
console.log(trace("fb", 935, 672, [...Array(10).fill(D.R)], [3,6,10], 80));
console.log("== W7a fb 底板970 跳西上 864板 ==");
for (const k of [8, 12])
  console.log(`tjL t1 k${k}:`, trace("fb", 970, 896, seq("L",1,k), [4,8,12], 60));
console.log("== W7b fb 864板(940) 越 bump896 ==");
for (const k of [8, 12])
  console.log(`tjL t1 k${k}:`, trace("fb", 940, 864, seq("L",1,k), [4,8,12], 60));
console.log("== W7c fb bump顶(880,832) 西行下坡到台地 ==");
console.log(trace("fb", 880, 832, [...Array(40).fill(D.L)], [5,10,20,30,40], 40));
console.log("== X1 wg 东块(1000,480) 跳东上 448slab东段 ==");
for (const k of [12, 16])
  console.log(`tjR t1 k${k}:`, trace("watergirl", 1000, 480, seq("R",1,k), [4,8,12,16], 60));
console.log("== X2 wg 448slab东段(1100,448) 东行离 -> 640块 ==");
console.log(trace("watergirl", 1100, 448, [...Array(12).fill(D.R)], [3,6,9,12,15], 80));
console.log("== X3 wg 640块(1180,640) 西行离 -> 736slab ==");
console.log(trace("watergirl", 1180, 640, [...Array(12).fill(D.L)], [3,6,9,12,15], 80));

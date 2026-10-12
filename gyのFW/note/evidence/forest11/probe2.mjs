// r28b: 关键跳孤立探测 —— fb 800块/F4 736slab/池入口 + wg 塔顶滑升
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
function run(role, x, feet, frames) {
  const w = setup(role, x, feet);
  const me = w.chars[role==="fb"?"fireboy":role];
  for (const fr of frames) w.step(DT, role==="fb"?{fireboy:fr,watergirl:ins0}:{fireboy:ins0,watergirl:fr});
  for (let i=0;i<80;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s = w.snapshotPlayer(role==="fb"?"fireboy":role);
  return [s.x.toFixed(0), (s.y+35.2).toFixed(0), s.dead||s.dying?"DEAD":"ok"];
}
const seq = (d, t, k) => { const out=[{...D[d],up:true}]; for(let i=1;i<t;i++) out.push(ins0); for(let i=0;i<k;i++) out.push(D[d]); return out; };
const rseq = (d, pre, k) => { const out=[]; for(let i=0;i<pre;i++) out.push(D[d]); out.push({...D[d],up:true}); for(let i=0;i<k;i++) out.push(D[d]); return out; };

console.log("== T1 fb 800block(1024-1088@800) 跳上 ==");
for (const [t,k] of [[1,8],[1,12],[1,16],[2,12],[2,16],[2,20],[1,20]])
  console.log(`tjR t${t} k${k}:`, run("fb", 1002, 896, seq("R",t,k)), " <- want x1024-1088 feet~800");
console.log("== T2 fb 736slab 跳上 from 800blk ==");
for (const [pre,k] of [[0,10],[0,14],[2,10],[2,14],[4,10]])
  console.log(`rjR pre${pre} k${k}:`, run("fb", 1038, 800, rseq("R",pre,k)), " <- want x1056-1248 feet~736");
console.log("== T3 fb 池入口 736slab 西缘跳西 ==");
for (const [t,k] of [[1,10],[1,14],[1,16],[1,18]])
  console.log(`tjL t${t} k${k}:`, run("fb", 1062, 736, seq("L",t,k)), " <- want pool(832-928,feet~672-704) or rim(928-960@704)");
console.log("== T4 wg 塔顶(896-928@352) 滑升 ==");
for (const [t,k] of [[1,10],[1,14],[2,10],[2,14],[1,18]])
  console.log(`tjR t${t} k${k}:`, run("watergirl", 878, 448, seq("R",t,k)), " <- want x896-928 feet~352");
console.log("== T5 wg 塔顶东行下落 p0 ==");
for (const k of [0,3,6])
  console.log(`walkoff k${k}:`, run("watergirl", 920, 352, [...Array(6).fill(D.R), ...Array(k).fill(D.R)]), " <- want x928-1024 feet~480");

// r28b: 塔顶东行 无长idle + 落p0 + fb 800块重试(带预跑) + 池入口变体
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
function trace(role, x, feet, frames, marks) {
  const w = setup(role, x, feet);
  const out=[];
  for (let i=0;i<frames.length;i++) {
    const fr = frames[i];
    w.step(DT, role==="fb"?{fireboy:fr,watergirl:ins0}:{fireboy:ins0,watergirl:fr});
    if (marks.includes(i)) { const s = w.snapshotPlayer(role==="fb"?"fireboy":role); out.push(`f${i}(${s.x.toFixed(0)},${(s.y+35.2).toFixed(0)})`); }
  }
  for (let i=0;i<100;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s = w.snapshotPlayer(role==="fb"?"fireboy":role);
  return out.join(" ") + ` END(${s.x.toFixed(0)},${(s.y+35.2).toFixed(0)})${s.dead||s.dying?" DEAD":""}`;
}
const seq = (d, t, k) => { const out=[{...D[d],up:true}]; for(let i=1;i<t;i++) out.push(ins0); for(let i=0;i<k;i++) out.push(D[d]); return out; };
const rseq = (d, pre, k) => { const out=[]; for(let i=0;i<pre;i++) out.push(D[d]); out.push({...D[d],up:true}); for(let i=0;i<k;i++) out.push(D[d]); return out; };

console.log("== U1 wg 塔顶(906,352)落地即东行 30f ==");
console.log(trace("watergirl", 878, 448, [...seq("R",1,14), ...Array(30).fill(D.R)], [14,20,30,40,44]));
console.log("== U2 wg 走离塔顶东缘(928) -> 落 480 ==");
console.log(trace("watergirl", 878, 448, [...seq("R",1,14), ...Array(14).fill(D.R)], [14,20,28,32,36,44,50]));
console.log("== U3 fb 800块: 从1000预跑+跳 t1k16 ==");
console.log(trace("fb", 988, 896, [...rseq("R",3,16)], [3,4,8,12,16,20,24,30]));
console.log("== U4 fb 池入口: 1062跳西 t1k10/k14 ==");
console.log(trace("fb", 1062, 736, [...seq("L",1,10)], [5,10,15,20,25,30]));
console.log(trace("fb", 1062, 736, [...seq("L",1,14)], [5,10,15,20,25,30]));
console.log("== U5 fb 池西浮 -> 海滩上陆 ==");
const pool = [...seq("L",1,14), ...Array(40).fill(D.L)];
console.log(trace("fb", 1062, 736, pool, [14,25,35,45,55,60,66,72]));

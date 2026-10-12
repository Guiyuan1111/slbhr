// r28b: wg 海滩大迂回连续验证 + X1修复 + 沟槽出口 + fb 长待机防睡眠
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const D = { R:{up:false,left:false,right:true}, L:{up:false,left:true,right:false} };
const I = () => ins0;
function mk(){ const w=makeWorld("forest_11"); for(let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0}); return w; }
function tp(w,role,x,feet){ const m=w.chars[role==="fb"?"fireboy":role]; m.body.SetPosition({x:-x/32,y:-(feet-35.2)/32}); m.body.SetLinearVelocity({x:0,y:0}); }
const pos=(w,role)=>{ const s=w.snapshotPlayer(role==="fb"?"fireboy":role); return {x:s.x,feet:s.y+35.2,dead:!!(s.dead||s.dying)}; };
const st=(d,t,k)=>{ const o=[{...D[d],up:true}]; for(let i=1;i<t;i++) o.push(ins0); for(let i=0;i<k;i++) o.push(D[d]); return o; };

console.log("== A. wg: 条带(787,480) 西行->墙顶->608箱->hyp跳->坡顶->掉海滩->东行->翻杆->西缘掉->800块->台地->坑底 ==");
{
  const w = mk(); tp(w,"watergirl",787,480);
  const log=[]; let f=0;
  const seg=(name,frames)=>{ for(const inp of frames){ w.step(DT,{fireboy:ins0,watergirl:inp}); f++; if(f%10===0){const p=pos(w,"watergirl"); log.push(`${name} f${f}(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);} } };
  const l0=()=>w.mechs.levers[0].state;
  seg("stripW", [...Array(22).fill(D.L)]);                    // 西行走离条带->墙顶->继续掉608箱
  let p=pos(w,"watergirl"); log.push(`[after stripW] (${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  seg("608walkE", [...Array(14).fill(D.R)]);                  // 东行到736
  p=pos(w,"watergirl"); log.push(`[preHyp] (${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  seg("hypHop", st("R",1,14));                                // 跳上hyp坡(32px)
  p=pos(w,"watergirl"); log.push(`[postHyp] (${p.x.toFixed(0)},${p.feet.toFixed(0)}) l0=${l0()}`);
  seg("toBeach", [...Array(16).fill(D.R)]);                   // 东行掉落海滩
  p=pos(w,"watergirl"); log.push(`[onBeach] (${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  seg("toLever", [...Array(18).fill(D.R)]);                   // 东行到杆
  p=pos(w,"watergirl"); log.push(`[atLever] (${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  seg("flip", [...Array(24).fill(D.L)]);                      // 按西翻杆
  p=pos(w,"watergirl"); log.push(`[flipped] (${p.x.toFixed(0)},${p.feet.toFixed(0)}) l0=${l0()} p1y=${(-32*w.mechs.platforms[1].body.GetPosition().y).toFixed(0)}`);
  seg("toWedge", [...Array(40).fill(D.L)]);                   // 西行到滩西缘并走离
  for(let i=0;i<50;i++){ w.step(DT,{fireboy:ins0,watergirl:ins0}); f++; if(f%20===0){p=pos(w,"watergirl"); log.push(`fall f${f}(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);} }
  p=pos(w,"watergirl"); log.push(`[afterWedge] (${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  seg("mesaW", [...Array(70).fill(D.L)]);                     // 西行下台地
  for(let i=0;i<40;i++){ w.step(DT,{fireboy:ins0,watergirl:ins0}); }
  p=pos(w,"watergirl"); log.push(`[pit] (${p.x.toFixed(0)},${p.feet.toFixed(0)}) dead=${p.dead}`);
  console.log(log.join("\n"));
}
console.log("== B. wg X1修复: (1000,480) tjR k24/k30 上448slab东段 ==");
for (const k of [24,30]) {
  const w=mk(); tp(w,"watergirl",1000,480);
  const fr=st("R",1,k); const log=[];
  for(let i=0;i<fr.length;i++){ w.step(DT,{fireboy:ins0,watergirl:fr[i]}); if([12,20,28,36].includes(i)){const p=pos(w,"watergirl");log.push(`f${i}(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);} }
  for(let i=0;i<80;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const p=pos(w,"watergirl"); log.push(`END(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  console.log(`k${k}:`, log.join(" "));
}
console.log("== C. wg 沟槽(1135,640) 西行走离->736slab->西缘->竖井->底板 ==");
{
  const w=mk(); tp(w,"watergirl",1135,640);
  const log=[];
  for(let i=0;i<26;i++){ w.step(DT,{fireboy:ins0,watergirl:{...D.L}}); if([6,12,18,26].includes(i)){const p=pos(w,"watergirl");log.push(`f${i}(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);} }
  for(let i=0;i<100;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const p=pos(w,"watergirl"); log.push(`END(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  console.log(log.join(" "));
}
console.log("== D. fb (944,864) 摇摆防睡800f->bump跳(板已降) ==");
{
  const w=mk(); tp(w,"watergirl",826,672);
  for(let i=0;i<24;i++) w.step(DT,{fireboy:ins0,watergirl:{...D.L}});
  console.log(`l0=${w.mechs.levers[0].state}`);
  tp(w,"fireboy",944,864);
  const log=[];
  for(let i=0;i<800;i++){ // 摇摆: 每50f east2/west2
    const m = (i%50<2)?D.R:(i%50<4)?D.L:ins0;
    w.step(DT,{fireboy:m,watergirl:ins0});
    if(i%200===0){const p=pos(w,"fireboy");log.push(`wait f${i}(${p.x.toFixed(0)},${p.feet.toFixed(0)}) p1y=${(-32*w.mechs.platforms[1].body.GetPosition().y).toFixed(0)}`);}
  }
  const p0=pos(w,"fireboy"); log.push(`[preJump] (${p0.x.toFixed(0)},${p0.feet.toFixed(0)})`);
  for(let i=0;i<30;i++){ w.step(DT,{fireboy:i===0?{up:true,left:true}:{...D.L},watergirl:ins0}); if([6,12,18,24,29].includes(i)){const p=pos(w,"fireboy");log.push(`j${i}(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);} }
  for(let i=0;i<80;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const p=pos(w,"fireboy"); log.push(`END(${p.x.toFixed(0)},${p.feet.toFixed(0)})`);
  console.log(log.join("\n"));
}

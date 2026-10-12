// r28b: wg 海滩翻杆 + 海滩返回爬升 + 448slab东长按k + 海脊->楼梯->海滩 连续 + fb 板降后越bump + fb 台地西下
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const D = { R:{up:false,left:false,right:true}, L:{up:false,left:true,right:false} };
const at = (w, role) => { const s = w.snapshotPlayer(role); return { x:s.x, feet:s.y+35.2, dead:!!(s.dead||s.dying) }; };
const seq = (d, t, k) => { const out=[{...D[d],up:true}]; for(let i=1;i<t;i++) out.push(ins0); for(let i=0;i<k;i++) out.push(D[d]); return out; };
const rseq = (d, pre, k) => { const out=[]; for(let i=0;i<pre;i++) out.push(D[d]); out.push({...D[d],up:true}); for(let i=0;i<k;i++) out.push(D[d]); return out; };
function tp(w, role, x, feet) { const me = w.chars[role==="fb"?"fireboy":role]; me.body.SetPosition({x:-x/32,y:-(feet-35.2)/32}); me.body.SetLinearVelocity({x:0,y:0}); }
function run(role, x, feet, frames, marks, coast=80) {
  const w = makeWorld("forest_11");
  for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  tp(w, role, x, feet);
  const out=[];
  for (let i=0;i<frames.length;i++) {
    w.step(DT, role==="fb"?{fireboy:frames[i],watergirl:ins0}:{fireboy:ins0,watergirl:frames[i]});
    if (marks.includes(i)) { const s=at(w,role==="fb"?"fireboy":role); out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`); }
  }
  for (let i=0;i<coast;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s=at(w,role==="fb"?"fireboy":role);
  return out.join(" ") + ` END(${s.x.toFixed(0)},${s.feet.toFixed(0)})${s.dead?" DEAD":""} w=${w}`;
}

console.log("== 1. wg 海滩翻杆 (826,672) 按W 22f ==");
{
  const w = makeWorld("forest_11"); for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  tp(w,"watergirl",826,672);
  for (let i=0;i<22;i++) w.step(DT,{fireboy:ins0,watergirl:{...D.L}});
  console.log(`l0=${w.mechs.levers[0].state} wg=${JSON.stringify(at(w,"watergirl"))}`);
}
console.log("== 2. wg 海滩返回爬升: (795/805,672) tjL k16/k22 ==");
for (const [sx,k] of [[795,16],[795,22],[805,16],[805,22]])
  console.log(`x${sx} k${k}:`, run("watergirl", sx, 672, seq("L",1,k), [6,12,18,24], 60));
console.log("== 3. wg 448slab东跳 k24/k30 (1000,480) ==");
for (const k of [24,30]) console.log(`k${k}:`, run("watergirl", 1000, 480, seq("R",1,k), [10,16,22,30,38], 70));

console.log("== 4. wg 352行东行掉落->条带/墙顶->海脊->楼梯->海滩 连续 ==");
{
  const w = makeWorld("forest_11"); for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  tp(w,"watergirl",772,353);
  const inp=[...Array(26).fill(D.R)];                       // 东行走离行端
  const marks=[4,8,12,16,20,26,32,38,44,50];
  const out=[];
  for (let i=0;i<inp.length;i++){ w.step(DT,{fireboy:ins0,watergirl:inp[i]}); if(marks.includes(i)){const s=at(w,"watergirl");out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);} }
  for (let i=0;i<60;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const s=at(w,"watergirl"); out.push(`END(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);
  console.log(out.join(" "));
}
console.log("== 5. fb: wg翻杆后 fb(975,896)->hop(864板)->走935->板降70f后越bump ==");
{
  const w = makeWorld("forest_11"); for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  tp(w,"watergirl",826,672);
  for (let i=0;i<22;i++) w.step(DT,{fireboy:ins0,watergirl:{...D.L}});   // 翻杆
  tp(w,"fireboy",975,896);
  for (let i=0;i<10;i++) w.step(DT,{fireboy:{...D.L},watergirl:ins0});   // W7a hop西上
  for (let i=0;i<60;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});       // 落864板+等板降
  const s0=at(w,"fireboy"); console.log(`after hop+wait: fb(${s0.x.toFixed(0)},${s0.feet.toFixed(0)}) p1y=${(-32*w.mechs.platforms[1].body.GetPosition().y).toFixed(0)}`);
  for (let i=0;i<6;i++) w.step(DT,{fireboy:{...D.L},watergirl:ins0});    // 西移到935
  const out=[]; const marks=[6,12,18,24,30];
  for (let i=0;i<30;i++){ w.step(DT,{fireboy:i===0?{up:true,left:true}:{...D.L},watergirl:ins0}); if(marks.includes(i)){const s=at(w,"fireboy");out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);} }
  for (let i=0;i<80;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const s=at(w,"fireboy"); out.push(`END(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);
  console.log("bump hop:", out.join(" "));
}
console.log("== 6. fb 台地(742,832) 西行->西坡下->坑底->门462 ==");
{
  const w = makeWorld("forest_11"); for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  tp(w,"fireboy",742,832);
  const out=[]; const marks=[10,20,40,60,80,100,120];
  for (let i=0;i<130;i++){ w.step(DT,{fireboy:{...D.L},watergirl:ins0}); if(marks.includes(i)){const s=at(w,"fireboy");out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);} }
  const s=at(w,"fireboy"); out.push(`END(${s.x.toFixed(0)},${s.feet.toFixed(0)})`);
  console.log(out.join(" "));
}

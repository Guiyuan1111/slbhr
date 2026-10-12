// r28b: W3c 更贴边起跳 / W6 真实序列(翻杆->板升->过板) / W7b' k加长 / W7c' 台地坡跳 / X1' k加长 / X2' 长按R
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
const at = (w, role) => { const s = w.snapshotPlayer(role==="fb"?"fireboy":role); return { x:s.x, feet:s.y+35.2, dead:!!(s.dead||s.dying) }; };
const seq = (d, t, k) => { const out=[{...D[d],up:true}]; for(let i=1;i<t;i++) out.push(ins0); for(let i=0;i<k;i++) out.push(D[d]); return out; };
const rseq = (d, pre, k) => { const out=[]; for(let i=0;i<pre;i++) out.push(D[d]); out.push({...D[d],up:true}); for(let i=0;i<k;i++) out.push(D[d]); return out; };

function run(role, x, feet, frames, marks, coast=80) {
  const w = setup(role, x, feet);
  const out=[];
  for (let i=0;i<frames.length;i++) {
    w.step(DT, role==="fb"?{fireboy:frames[i],watergirl:ins0}:{fireboy:ins0,watergirl:frames[i]});
    if (marks.includes(i)) { const s=at(w,role); out.push(`f${i}(${s.x.toFixed(0)},${s.feet.toFixed(0)})`); }
  }
  for (let i=0;i<coast;i++) w.step(DT, role==="fb"?{fireboy:ins0,watergirl:ins0}:{fireboy:ins0,watergirl:ins0});
  const s=at(w,role);
  return out.join(" ") + ` END(${s.x.toFixed(0)},${s.feet.toFixed(0)})${s.dead?" DEAD":""}`;
}

console.log("== W3c rjL pre22 k44 (起跳更贴西缘) ==");
console.log(run("fb", 1120, 736, rseq("L",22,44), [18,26,34,42,50], 60));

console.log("== W6 真实序列: fb 落滩(806,672) 翻杆->等板升->东行过板 ==");
{
  const w = setup("fb", 806, 672);
  const log=[];
  let flipped=-1, plateY=-1;
  for (let i=0;i<30;i++) w.step(DT,{fireboy:{...D.L},watergirl:ins0});            // 按西 翻杆
  const st = w.mechs && null; 
  log.push(`after30: fb(${JSON.stringify(at(w,"fb"))})`);
  // 之后一直按东, 记录板与fb
  for (let i=0;i<260;i++) {
    w.step(DT,{fireboy:{...D.R},watergirl:ins0});
    const s = at(w,"fb");
    // p1 平台: 找 mech 输出
    if ([0,10,20,40,60,90,120,160,200,240,259].includes(i)) {
      let py = "?";
      try { for (const m of w.mechManager?.mechs?.values?.() ?? []) { if (m.def?.id==="p1"||m.id==="p1") py = (-32*m.body.GetPosition().y).toFixed(0)+"@"+(-32*m.body.GetPosition().x).toFixed(0); } } catch(e){ py="E:"+e.message; }
      log.push(`f${i}: fb(${s.x.toFixed(0)},${s.feet.toFixed(0)})${s.dead?" DEAD":""} p1y=${py}`);
    }
  }
  console.log(log.join("\n"));
}

console.log("== W7b' fb 940,864 tjL k20/k28 越bump ==");
for (const k of [20,28]) console.log(`k${k}:`, run("fb", 940, 864, seq("L",1,k), [8,14,20,26], 60));

console.log("== W7c' fb 台地东坡跳: 802,864 / 806,864 ==");
for (const sx of [802, 806]) console.log(`from${sx}:`, run("fb", sx, 864, seq("L",1,14), [6,12,18,24], 60));

console.log("== X1' wg 1000,480 tjR k24/k30 ==");
for (const k of [24,30]) console.log(`k${k}:`, run("watergirl", 1000, 480, seq("R",1,k), [10,16,22,30,38], 60));

console.log("== X2' wg 1100,448 长按R 34f 走离东缘 ==");
console.log(run("watergirl", 1100, 448, [...Array(34).fill(D.R)], [10,18,24,30,34], 90));

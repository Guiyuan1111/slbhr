// r28b: 机制内省 + 板升起测量 + 板升后 fb 越bump + wg 海滩往返关键跳
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

console.log("== A. world 键与机制内省 ==");
{
  const w = setup("fb", 826, 672);
  console.log("world keys:", Object.keys(w).join(","));
  console.log("chars keys:", Object.keys(w.chars||{}).join(","));
  for (const k of Object.keys(w)) {
    const v = w[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const ks = Object.keys(v).slice(0,12);
      if (ks.length) console.log(`  w.${k}: {${ks.join(",")}}`);
    }
  }
}

console.log("== B. 翻杆->板升测量 + p1 位置读法 ==");
{
  const w = setup("fb", 826, 672);
  const seq = [];
  for (let i=0;i<22;i++) seq.push({...D.L});      // 按西翻杆
  for (let i=0;i<200;i++) seq.push(ins0);          // 等板升
  let flipF=-1, riseF=-1;
  const p1get = () => { try {
    if (w.devices) for (const d of (w.devices.all?.() ?? [])) { if ((d.def?.id||d.id) === "p1") return {y:-32*d.body.GetPosition().y, st:d.state}; } 
  } catch(e){} return null; };
  for (let i=0;i<seq.length;i++) {
    w.step(DT,{fireboy:seq[i],watergirl:ins0});
    const p = p1get();
    if (p) { if (i<25 && p.st===1 && flipF<0) flipF=i; if (p.y<780 && riseF<0) { riseF=i; console.log(`rise starts f${i} p1y=${p.y.toFixed(1)} st=${p.st}`); } if ([10,30,60,100,150,200].includes(i)) console.log(`f${i} p1y=${p.y.toFixed(1)} st=${p.st}`); }
  }
  console.log(`flipF=${flipF} riseF=${riseF} p1read=${JSON.stringify(p1get())}`);
  console.log("devices keys:", w.devices ? Object.keys(w.devices).join(",") : "NONE");
  if (w.devices?.all) { const all = w.devices.all(); console.log("devices.all():", (all||[]).map(d=>`${d.def?.id||d.id}@y${(-32*d.body.GetPosition().y).toFixed(0)}`).join(" ")); }
}

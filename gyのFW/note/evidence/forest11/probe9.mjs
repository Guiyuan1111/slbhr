// r28b: mechs 内省 + 翻杆->板升测量
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
const M = w => w.mechs;
{
  const w = setup("fb", 826, 672);
  const m = M(w);
  console.log("levers:", (m.levers||[]).map?.call ? "obj" : typeof m.levers);
  const dump = (name, v) => {
    if (Array.isArray(v)) console.log(name, "[", v.map(x=>`${x.def?.id||x.id||"?"}(st${x.state??""})`).join(" "), "]");
    else if (v && typeof v==="object") { const ks=Object.keys(v); console.log(name, "{", ks.slice(0,8).join(","), "}"); if (v instanceof Map) console.log(name, "Map:", [...v.keys()]); }
    else console.log(name, typeof v, v);
  };
  dump("levers", m.levers); dump("platforms", m.platforms); dump("manager", m.manager);
  if (m.manager) { console.log("manager keys:", Object.keys(m.manager).join(",")); 
    for (const k of Object.keys(m.manager)) { const v=m.manager[k]; if (Array.isArray(v)) dump("  mgr."+k, v); }
  }
}
console.log("== 翻杆->板升 ==");
{
  const w = setup("fb", 826, 672);
  const m = M(w);
  const p1 = (m.platforms||[]).find?.(p => (p.def?.id||p.id) === "p1") || (m.platforms||[])[0];
  const l0 = (m.levers||[]).find?.(l => (l.def?.id||l.id) === "l0") || (m.levers||[])[0];
  console.log("p1 found:", !!p1, "l0 found:", !!l0);
  const py = () => p1 ? (-32*p1.body.GetPosition().y).toFixed(1) : "?";
  const st = () => l0 ? l0.state : "?";
  let log=[];
  for (let i=0;i<240;i++) {
    const inp = i<22 ? {...D.L} : ins0;
    w.step(DT,{fireboy:inp,watergirl:ins0});
    if ([0,5,10,15,18,21,22,25,30,40,60,90,120,180,239].includes(i)) log.push(`f${i} l0=${st()} p1y=${py()}`);
  }
  console.log(log.join("\n"));
}

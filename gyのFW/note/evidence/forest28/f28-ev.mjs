// f28-ev.mjs — forest_28 前 600f 事件与机关状态逐段记录
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_28");
const DT = 1/60, r1 = (v)=>Math.round(v*10)/10;
const ins = {up:false,left:false,right:false};
for (let i=0;i<600;i++) {
  const evs = w.step(DT, {fireboy:{...ins},watergirl:{...ins}});
  for (const e of evs) if (i<300 || e.type!=="mech") console.log(`f${i}`, JSON.stringify(e));
  if (i%100===99) console.log(`-- f${i}: winds[${w.mechs.winds.map(f=>f.state)}] levers[${w.mechs.levers.map(l=>l.state)}] plats[${w.mechs.platforms.map(p=>`${r1(p.body.GetPosition().x*-32)},${r1(p.body.GetPosition().y*-32)},st${p.state}`)}]`);
}
console.log("wind defs rotation/rect:", JSON.stringify(w.level.winds.map(f=>({id:f.id,rot:f.rotation,rect:f.rect,len:f.lengthM}))));

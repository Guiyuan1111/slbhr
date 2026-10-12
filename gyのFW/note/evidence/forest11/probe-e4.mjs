// r28b: wg 480slab 东行卡 787 诊断 + p0 状态检查
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const R = {up:false,left:false,right:true};
const w = makeWorld("forest_11");
for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
const me = w.chars.watergirl;
me.body.SetPosition({ x:-787/32, y:-(480-35.2)/32 });
me.body.SetLinearVelocity({ x:0, y:0 });
const p0 = w.mechs.platforms.find(p => p.group === 5);
console.log("p0 state:", p0.state, "pos:", (()=>{const q=p0.body.GetPosition();return [(-32*q.x).toFixed(1),(-32*q.y).toFixed(1)];})());
for (let f=0; f<130; f++) {
  w.step(DT, {fireboy:ins0, watergirl:R});
  if (f%10===0) {
    const s = w.snapshotPlayer("watergirl");
    const v = me.body.GetLinearVelocity();
    console.log(`f${f} (${s.x.toFixed(1)},${(s.y+35.2).toFixed(1)}) vx=${(v.x*32).toFixed(2)} contacts=${me.feetContacts.filter(c=>c.IsTouching&&c.IsTouching()).length}`);
  }
}

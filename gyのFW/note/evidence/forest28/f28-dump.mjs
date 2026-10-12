// f28-dump.mjs — forest_28 解码 v3：机关 f0 状态 + 200f 无输入观察
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_28");
const DT = 1/60, r1 = (v)=>Math.round(v*10)/10;
const pos = (r) => { const s = w.snapshotPlayer(r); return { x:r1(s.x), feet:r1(s.y+35.2), dead:!!(s.dead||s.dying) }; };
console.log("t0 fb", JSON.stringify(pos("fireboy")), "wg", JSON.stringify(pos("watergirl")));
console.log("t0 winds:", w.mechs.winds.map(f=>`g${f.group}:${f.state}`).join(" "), "levers:", w.mechs.levers.map(l=>`g${l.group}:${l.state}`).join(" "));
for (let i=0;i<200;i++) w.step(DT, {fireboy:{up:false,left:false,right:false},watergirl:{up:false,left:false,right:false}});
console.log("200f winds:", w.mechs.winds.map(f=>`g${f.group}:${f.state}`).join(" "), "levers:", w.mechs.levers.map(l=>`g${l.group}:${l.state}`).join(" "));
console.log("200f platforms:", w.mechs.platforms.map(p=>`(${r1(p.body.GetPosition().x*-32)},${r1(p.body.GetPosition().y*-32)}) state=${p.state}`).join(" "));
console.log("200f fb", JSON.stringify(pos("fireboy")), "wg", JSON.stringify(pos("watergirl")));
// 600f 继续观察 p1(dy:3) 移动
for (let i=0;i<400;i++) w.step(DT, {fireboy:{up:false,left:false,right:false},watergirl:{up:false,left:false,right:false}});
console.log("600f platforms:", w.mechs.platforms.map(p=>`(${r1(p.body.GetPosition().x*-32)},${r1(p.body.GetPosition().y*-32)})`).join(" "));
console.log("600f fb", JSON.stringify(pos("fireboy")), "wg", JSON.stringify(pos("watergirl")));

// plev.mjs — 杠杆翻转前后机关快照（id7/id9 位置与包围盒）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_29");
const px = (b) => ({ x: +(b.GetPosition().x * -32).toFixed(2), y: +(b.GetPosition().y * -32).toFixed(2) });
const dump = (tag) => {
  console.log(`--- ${tag}`);
  for (const l of w.mechanisms.levers) console.log(`lever g${l.group} state=${l.state} pos=`, px(l.body));
  for (const p of w.mechanisms.pushers) console.log(`pusher g${p.group} state=${p.state} t=${p.joint.GetJointTranslation().toFixed(3)} pos=`, px(p.body));
  for (const pl of w.mechanisms.platforms) {
    const v = [];
    let fx = pl.body.GetFixtureList();
    while (fx) { const sh = fx.GetShape(); if (sh.m_vertices) { const c = Math.cos(pl.body.GetAngle()), s = Math.sin(pl.body.GetAngle());
      v.push(sh.m_vertices.slice(0,4).map(q => { const wx = pl.body.GetPosition().x + c*q.x - s*q.y, wy = pl.body.GetPosition().y + s*q.x + c*q.y; return `(${(+(-wx*32).toFixed(1))},${(+(-wy*32).toFixed(1))})`; }).join("")); } fx = fx.GetNext(); }
    console.log(`plat g${pl.group} state=${pl.state} pos=`, px(pl.body), "verts:", v.join(" | "));
  }
};
dump("f0");
// fb 走上杠杆臂（v35 的落点 474.5,380.4 附近）：直接传送式模拟——用事件让 fb 跳到平台再东滑
const F = [];
for (let f = 0; f < 900; f++) F.push({ left: false, right: false, up: false });
const set = (f, d, on) => { F[f][d] = on; };
// 简化：右行上板→西跳两次→东行走上臂（粗略，只为翻转杠杆）
set(2,"left",true); set(23,"left",false); set(24,"up",true); set(24,"left",true); set(79,"up",false); set(79,"left",false);
set(114,"left",true); set(123,"up",true); set(178,"up",false); set(178,"left",false);
set(320,"right",true); set(335,"right",false); set(342,"up",true); set(342,"right",true); set(397,"up",false); set(397,"right",false);
set(400,"right",true); set(422,"right",false); set(423,"up",true); set(423,"right",true); set(478,"up",false); set(478,"right",false);
for (let f = 0; f < 900; f++) {
  w.step(1/60, { fireboy: F[f], watergirl: { left: false, right: false, up: false } });
  const s = w.snapshotPlayer("fireboy");
  if (f % 60 === 0 || s.dead) console.log(`f${f} fb(${+s.x.toFixed(1)},${+s.y.toFixed(1)})${s.dead ? " DEAD" : ""}`);
  if (s.dead) break;
}
dump("after");

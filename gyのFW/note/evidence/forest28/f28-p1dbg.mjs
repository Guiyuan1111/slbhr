import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_28");
const DT = 1/60;
const scr = (b) => ({ x: -32*b.GetPosition().x, y: -32*b.GetPosition().y });
const near = (arr, x, y) => arr.find(m => { const s = scr(m.body); return Math.abs(s.x-x)<2 && Math.abs(s.y-y)<2; });
const p1 = near(w.mechs.platforms, 1072, 848);
for (let f = 0; f < 30; f++) w.step(DT, { fireboy: { cursors: {} }, watergirl: { cursors: {} } });
const j = p1.joint;
console.log("joint type:", j.GetType ? j.GetType() : "?");
console.log("motorSpeed:", j.GetMotorSpeed(), "maxForce:", j.GetMaxMotorForce ? j.GetMaxMotorForce() : "?", "enableMotor:", j.IsMotorEnabled ? j.IsMotorEnabled() : "?");
console.log("lower:", j.GetLowerLimit(), "upper:", j.GetUpperLimit(), "trans:", j.GetJointTranslation());
console.log("axis:", JSON.stringify(j.GetJointAxis ? j.GetJointAxis() : "?"));
console.log("bodyType p1:", p1.body.GetType(), "mass:", p1.body.GetMass());
p1.state = 1; p1.signalApply();
console.log("after signalApply motorSpeed:", j.GetMotorSpeed());
for (let f = 0; f < 240; f++) {
  w.step(DT, { fireboy: { cursors: {} }, watergirl: { cursors: {} } });
  if (f % 60 === 59) { const c = scr(p1.body); console.log(`f${f} p1 (${c.x.toFixed(1)},${c.y.toFixed(1)}) trans=${j.GetJointTranslation().toFixed(2)}`); }
}

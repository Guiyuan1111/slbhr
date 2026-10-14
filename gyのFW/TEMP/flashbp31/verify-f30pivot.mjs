// f30 杠杆支点复核：joint 世界锚（约束保持点）= 创建时锚点（体角 0 时算出）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_30");
const M = w.mechanisms;
for (const l of M.levers) {
  const a = l.joint.GetAnchorA({x:0,y:0});
  console.log(`f30 lever g${l.group} bodyPos=(${+(l.body.GetPosition().x*-32).toFixed(2)},${+(l.body.GetPosition().y*-32).toFixed(2)}) angle=${(l.body.GetAngle()*180/Math.PI).toFixed(2)} anchorA(px)=(${+(a.x*-32).toFixed(2)},${+(a.y*-32).toFixed(2)})`);
}

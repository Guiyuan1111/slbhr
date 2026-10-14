// 内核侧：forest_24 r0 Roman 杆自由摆振——ApplyAngularImpulse(5) 后角轨迹（每 15f=250ms 采样）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const w = makeWorld("forest_24");
for (let i = 0; i < 600; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
const bar = w.mechs.romans[0].bar;
const r3 = (v) => Math.round(v * 1e3) / 1e3;
console.log("kernel a0 =", r3((bar.GetAngle() * 180) / Math.PI));
bar.SetAwake(true);
bar.SetAngularVelocity(0.3);
const tl = [];
for (let i = 0; i < 300; i++) {
  w.step(1 / 60, { fireboy: {}, watergirl: {} });
  if ((i + 1) % 15 === 0) tl.push(r3((bar.GetAngle() * 180) / Math.PI));
}
console.log("kernel angles(°) @250ms:", JSON.stringify(tl));

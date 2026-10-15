// r24b 杆静息几何 dump：顶点世界坐标 —— 供跳跃/行走判定
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_24");
for (let i = 0; i < 240; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
for (const [name, rom] of [["r0", w.mechanisms.romans[0]], ["r1", w.mechanisms.romans[1]]]) {
  const bar = rom.bar;
  const cx = sx(bar), cy = sy(bar), a = bar.GetAngle();
  console.log(`${name}: bar center=(${cx},${cy}) ang=${(a * 180 / Math.PI).toFixed(2)}°`);
  const sh = bar.GetFixtureList().GetShape();
  for (const v of sh.m_vertices) {
    const wx = cx + -(v.x * Math.cos(a) - v.y * Math.sin(a)) * 32;
    const wy = cy + -(v.x * Math.sin(a) + v.y * Math.cos(a)) * 32;
    console.log(`  local(${(v.x * 32).toFixed(0)},${(v.y * 32).toFixed(0)}) → world(${wx.toFixed(1)},${wy.toFixed(1)})`);
  }
}

// 测风机角度/推力模式
import { wgRun } from "./p14-wg-v11.mjs";
wgRun({ dbg: (f, w) => {
  if (f % 30 !== 0) return;
  const wind = w.mechs.winds[0];
  const a = wind.body.GetAngle();
  console.log(`f${f}: angle=${(a * 180 / Math.PI).toFixed(1)}deg state=${wind.state}`);
}});

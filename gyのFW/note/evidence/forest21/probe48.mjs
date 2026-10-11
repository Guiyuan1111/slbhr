// 续：wg 从 r20-c0-1 条带东走 → 坡级联 → r23 → 东走 B(192,672) 窗口 → 落地板 → 西走到门
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
const w = makeWorld("forest_21");
const wg = w.chars.watergirl;
let b672 = false, trace = [];
for (let f = 0; f < 900; f++) {
  const inp = f >= 3 && f < 123 ? { up: false, left: false, right: true }       // 东到 r15
        : f >= 123 && f < 210 ? { up: false, left: true, right: false }          // 西走落级联→r20条带
        : f >= 210 && f < 330 ? { up: false, left: false, right: true }          // 东走: 坡级联→r23→窗口
        : f >= 330 && f < 420 ? IDLE                                             // r23 上稍停(避免冲过窗口)
        : f >= 420 && f < 460 ? { up: false, left: false, right: true }          // 继续东
        : f >= 460 && f < 470 ? IDLE
        : f >= 470 && f < 640 ? { up: false, left: true, right: false }          // 落地板后西走到门
        : IDLE;
  w.step(1 / 60, { fireboy: { ...IDLE }, watergirl: inp });
  const [x, y] = pos(wg);
  if (Math.abs(x - 192) < 38 && Math.abs(y - 672) < 38) b672 = true;
  if (f % 30 === 0) trace.push(`f${f}:${x},${y}`);
}
console.log(trace.join("  "));
const d = w.diamonds.find(dd => Math.round(dd.x) === 192 && Math.round(dd.y) === 672);
console.log("B672 collected:", b672, " flag:", d.collected);
console.log("final:", pos(wg).join(","), " wg at wg-door(96,896)±?: all:", w.diamonds.map(x => x.collected ? 1 : 0).join(""));

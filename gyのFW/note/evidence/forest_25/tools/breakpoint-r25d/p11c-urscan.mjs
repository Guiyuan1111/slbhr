// r25d p11c：台沿 UR 跳细扫 + 弧线 trace
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const UR = { up: true, left: false, right: true };

function urCase(hold) {
  const w = makeWorld("forest_25");
  for (let f = 0; f < 90; f++) w.step(1 / 60, { fireboy: N, watergirl: N });
  // 快进到台沿：复刻 p11b 的 A-C（L 持续直到台沿站稳）
  let st = -1;
  for (let f = 90; f < 600; f++) {
    w.step(1 / 60, { fireboy: N, watergirl: L });
    const p = w.snapshotPlayer("watergirl");
    if (p.y > 245 && p.y < 262 && Math.abs(p.vx) < 5 && p.x > 320 && p.x < 352) { st = f; break; }
  }
  if (st < 0) return `未达台沿`;
  const p0 = w.snapshotPlayer("watergirl");
  let traj = `起跳@(${px(p0.x)},${px(p0.y)}) `;
  for (let f = 0; f < 160; f++) {
    const inp = f < hold ? UR : N;
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const p = w.snapshotPlayer("watergirl");
    if (f % 10 === 0) traj += `f${f}:(${px(p.x)},${px(p.y)}) `;
    if (p.dead) return traj + `DEAD f${f} @(${px(p.x)},${px(p.y)})`;
    if (f > 30 && Math.abs(p.vy) < 5 && p.y > 250) {
      const on = p.x > 465 && p.x < 576 && p.y > 250 && p.y < 300;
      return traj + `落地 f${f} @(${px(p.x)},${px(p.y)}) ${on ? "★塔三级" : "未中"}`;
    }
  }
  return traj + "160f未判";
}
for (const hold of [24, 26, 28, 30, 31, 32, 33, 34, 36]) console.log(`UR=${hold}: ${urCase(hold)}`);

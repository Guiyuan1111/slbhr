// 扫 JBLK UL hold 帧数 → 落点
import { wgRun } from "./p21-wg-v12.mjs";
for (const h of [18, 24, 28, 32, 36, 40, 44]) {
  const r = wgRun({ dbg: () => {} });
  // hack: 通过临时改参数不行——直接内联重跑：
}
// 直接改 p21 源码不行，这里用参数化重实现 JBLK 段：借用 wgRun 但截获 phase
// 简化：复制运行逻辑，仅扫 hold
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
function scan(hold) {
  const w = makeWorld("forest_25");
  let ph = "A", jt = -1, sub = 0, res = "";
  for (let f = 0; f < 900; f++) {
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (ph) {
        case "A": if (q.y > 200) ph = "B"; return L;
        case "B": if (q.x < 545 && q.y > 250) ph = "C"; return L;
        case "C": if (q.y > 245 && q.y < 262 && Math.abs(q.vx) < 5 && q.x > 320 && q.x < 352) ph = "CP"; return L;
        case "CP": if (q.x > 385) ph = "CF"; return R;
        case "CF": if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 384) { ph = "FWB", jt = 0; } return N;
        case "FWB": jt++; if (Math.abs(q.vx) < 20 && jt > 15) { ph = "JBLK", jt = 0; } return N;
        case "JBLK": { jt++;
          if (jt > hold + 15 && Math.abs(q.vy) < 8 && q.y > 290) {
            res = `land f${f} (${q.x.toFixed(1)},${q.y.toFixed(1)}) zone=${q.x >= 224 && q.x <= 290 && q.y > 395 && q.y < 428 ? "SHELF✓" : q.x > 288 && q.x < 385 && q.y > 300 && q.y < 335 ? "plateau✗" : "other"}`;
            return N;
          }
          if (jt > hold + 200) { res = `stuck (${q.x.toFixed(1)},${q.y.toFixed(1)})`; return N; }
          return jt <= hold ? UL : N; }
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (q.dead || q.dying) { res = `DEAD (${q.x.toFixed(1)},${q.y.toFixed(1)})`; break; }
    if (res) break;
  }
  return res;
}
for (const h of [18, 24, 28, 32, 36, 40, 44, 48]) console.log(`hold=${h}: ${scan(h)}`);

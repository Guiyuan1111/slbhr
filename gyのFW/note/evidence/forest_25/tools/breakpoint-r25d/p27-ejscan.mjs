// 扫弹射后持R帧数 h → 落点
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
function scan(h) {
  const w = makeWorld("forest_25");
  let ph = "A", res = "";
  for (let f = 0; f < 900; f++) {
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (ph) {
        case "A": if (q.y > 200) { ph = "B", jt0 = f; } return L;
        case "B": {
          const q2 = q;
          if (q2.y > 240 && q2.y < 268 && Math.abs(q2.vy) < 8 && q2.x > 700 && q2.x < 840) { res = `land (${q2.x.toFixed(0)},${q2.y.toFixed(0)})`; return N; }
          if (q2.y > 290 && q2.x > 560 && q2.x < 750) { if (f - jt0 > 400) { res = `pool-loop (${q2.x.toFixed(0)},${q2.y.toFixed(0)})`; return N; } return R; }
          if (q2.y > 200 && q2.y < 240 && Math.abs(q2.vy) < 8 && q2.x > 795) { res = `mesa (${q2.x.toFixed(0)},${q2.y.toFixed(0)})`; return N; }
          return f - jt0 <= h ? R : N;
        }
        default: return N;
      }
    })();
    var jt0 = jt0 ?? 0;
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (q.dead) { res = "DEAD"; break; }
    if (res) break;
  }
  return res || "timeout";
}
for (const h of [0, 6, 10, 14, 18, 22, 26, 30]) console.log(`h=${h}: ${scan(h)}`);

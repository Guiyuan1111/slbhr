// 2D 扫描 v2：CF 下落段 R 保持帧 × HB 跳保持帧 → 块顶(384-416,416-448)落点
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
function scan(cfR, hbT) {
  const w = makeWorld("forest_25");
  let ph = "A", jt = -1, res = "", f2x = -1;
  for (let f = 0; f < 700; f++) {
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (ph) {
        case "A": if (q.y > 200) ph = "B"; return L;
        case "B": if (q.x < 545 && q.y > 250) ph = "C"; return L;
        case "C": if (q.y > 245 && q.y < 262 && Math.abs(q.vx) < 5 && q.x > 320 && q.x < 352) ph = "CP"; return L;
        case "CP": if (q.x > 385) { ph = "CF"; jt = 0; } return R;
        case "CF": { jt++;
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 384) { f2x = q.x; ph = "HB", jt = 0; }
          return jt <= cfR ? R : N; }
        case "HB": { jt++;
          const post = jt > 45 + hbT; // 起跳后（UL 从 jt=46 开始）
          if (post && q.y > 370 && q.y < 400 && Math.abs(q.vy) < 12 && q.x > 383 && q.x < 417) { res = `BLOCK (${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (post && q.y > 300 && q.y < 340 && Math.abs(q.vy) < 12 && q.x > 352 && q.x < 424) { res = `stair/hyp (${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (post && q.y > 405 && q.y < 430 && Math.abs(q.vy) < 12 && q.x > 417) { res = `shelfE (${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (jt > 300) { res = `timeout (${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (jt < 30) return q.x < 460 ? R : N;
          if (jt < 45) return N;
          return jt <= 45 + hbT ? UL : N; }
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (q.dead) { res = "DEAD"; break; }
  }
  return `F2@${f2x < 0 ? "-" : f2x.toFixed(1)} → ${res || "unfinished"}`;
}
for (const cfR of [0, 8, 16, 24, 32]) for (const hbT of [8, 10, 12, 14, 16, 18, 20, 24]) {
  console.log(`cfR=${String(cfR).padStart(2)} hbT=${String(hbT).padStart(2)}: ${scan(cfR, hbT)}`);
}

// 近距起跳扫描 v2：刹停点 x × hbT → 块顶 [384,391]×y370-400
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
function run(bx, hbT) {
  const w = makeWorld("forest_25");
  let ph = "A", jt = -1, res = "";
  for (let f = 0; f < 700; f++) {
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (ph) {
        case "A": if (q.y > 200) ph = "B"; return L;
        case "B": if (q.x < 545 && q.y > 250) ph = "C"; return L;
        case "C": if (q.y > 245 && q.y < 262 && Math.abs(q.vx) < 5 && q.x > 320 && q.x < 352) ph = "CP"; return L;
        case "CP": if (q.x > 385) { ph = "CF"; jt = 0; } return R;
        case "CF": { jt++;
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 384) { ph = "HB", jt = 0; }
          return N; }
        case "HB": { jt++;
          const post = jt > 8 + hbT;
          if (post && q.y > 370 && q.y < 400 && Math.abs(q.vy) < 12 && q.x > 383 && q.x < 417) { res = `BLK(${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (post && q.y > 300 && q.y < 340 && Math.abs(q.vy) < 12 && q.x > 352 && q.x < 424) { res = `STAIR(${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (post && q.y > 405 && q.y < 430 && Math.abs(q.vy) < 12 && q.x > 417) { res = `SHELF(${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (jt > 300) { res = `TO(${q.x.toFixed(1)},${q.y.toFixed(1)})`; ph = "END"; return N; }
          if (jt < 20) return q.x < bx ? R : N;
          return jt <= 20 + hbT ? UL : N; }
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (q.dead) { res = "DEAD"; break; }
  }
  return res || "unfinished";
}
for (const bx of [430, 436, 442, 448, 454]) {
  let row = `bx=${bx}: `;
  for (const hbT of [10, 12, 14, 16, 18]) row += `h${hbT}=${run(bx, hbT)}  `;
  console.log(row);
}

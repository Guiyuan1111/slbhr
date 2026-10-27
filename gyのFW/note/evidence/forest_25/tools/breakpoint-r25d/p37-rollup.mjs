// C 点 (335.6,252.6) 持 L：能否 corner-roll 滚上 terrace (256)?
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const w = makeWorld("forest_25");
let ph = "A", rollF = -1;
for (let f = 0; f < 900; f++) {
  const inp = f < 90 ? N : (() => {
    const q = w.snapshotPlayer("watergirl");
    switch (ph) {
      case "A": if (q.y > 200) ph = "B"; return L;
      case "B": if (q.x < 545 && q.y > 250) ph = "C"; return L;
      case "C": // 到达 ledge 后继续持 L，观察是否滚上 terrace
        if (q.y > 245 && q.y < 262 && Math.abs(q.vx) < 5 && q.x > 320 && q.x < 352) {
          if (rollF < 0) { rollF = f; console.log(`C arrive f${f} (${px(q.x)},${px(q.y)})`); }
        }
        if (q.y < 240 && q.x < 320) { console.log(`ROLL-UP TERRACE f${f} (${px(q.x)},${px(q.y)})`); ph = "ONTERRACE"; }
        if (q.x < 300 && q.y > 240 && q.y < 275 && Math.abs(q.vy) < 8) { console.log(`ROLL-UP TERRACE2 f${f} (${px(q.x)},${px(q.y)})`); ph = "ONTERRACE"; }
        return L;
      case "ONTERRACE":
        if (q.x < 210 && q.y > 245 && q.y < 262) { console.log(`TERR-WEST f${f} (${px(q.x)},${px(q.y)}) — terrace 西段到达`); return N; }
        return L;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: N, watergirl: inp });
  const q = w.snapshotPlayer("watergirl");
  if (q.dead) { console.log("DEAD f" + f); break; }
  if (ph === "ONTERRACE" && f % 30 === 0) console.log(`  f${f}: (${px(q.x)},${px(q.y)}) ${ph}`);
}
console.log("final:", w.snapshotPlayer("watergirl").x.toFixed(1), w.snapshotPlayer("watergirl").y.toFixed(1));

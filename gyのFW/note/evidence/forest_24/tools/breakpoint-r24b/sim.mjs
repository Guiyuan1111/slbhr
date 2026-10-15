// r24b 富日志内核回放：node --import tsx TEMP/r24b/sim.mjs <route.json> [--win f0:f1] [--every N]
// 逐 N 帧打印：fb/wg、箱、r0/r1 杆角、平台、门 frac、phase。用于路线分段迭代。
import { readFileSync } from "node:fs";
import { expandFlat, makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const args = process.argv.slice(2);
const routePath = args[0];
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const [w0, w1] = String(argOf("--win", "0:-1")).split(":").map(Number);
const EVERY = Number(argOf("--every", "30"));

const doc = JSON.parse(readFileSync(routePath, "utf8"));
const total = doc.totalFrames;
const ins = expandFlat(doc.fb, doc.wg, total);
const w = makeWorld("forest_24");
const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
const ang = (b) => +(b.GetAngle() * 180 / Math.PI).toFixed(2);
const M = w.mechanisms;
const box = M.props[0].body;
const r0 = M.romans[0].bar, r1 = M.romans[1].bar;
const plat = M.platforms[0].body;

let winF = -1, deathF = -1;
const fbB = w.players.fireboy.body, wgB = w.players.watergirl.body;
for (let f = 0; f < total; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
  const inWin = f >= w0 && (w1 < 0 || f <= w1);
  if (inWin && f % EVERY === 0) {
    const doors = w.doors;
    console.log(
      `f${String(f).padStart(4)} fb(${sx(fbB)},${sy(fbB)}) wg(${sx(wgB)},${sy(wgB)}) ` +
      `box(${sx(box)},${sy(box)})@${ang(box)} r0=${ang(r0)} r1=${ang(r1)} ` +
      `plat=${sx(plat)} st=${M.platforms[0].state} dFb=${doors.fireboy.frac.toFixed(0)}/${doors.fireboy.isOpen ? 1 : 0} ` +
      `dWg=${doors.watergirl.frac.toFixed(0)}/${doors.watergirl.isOpen ? 1 : 0} ph=${w.phase}`
    );
  }
  if (fb.dead || wg.dead || fb.dying || wg.dying) { deathF = f; break; }
  if (w.phase === "won") { winF = f; break; }
}
console.log(deathF >= 0 ? `DEATH @f${deathF}` : winF >= 0 ? `WIN @f${winF}` : `TIMEOUT (${total})`);

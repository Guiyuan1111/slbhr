// r25c forest_25 内核探针 4：wg 攀爬链（骑角→西跳→阶梯→塔顶→横带→l0 关风）
// 用法: node --import tsx TEMP/r25c/probe4.mjs (在 gyのFW 根)
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const px = (n) => Math.round(n * 10) / 10;
const IDLE = 90;
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const N = { up: false, left: false, right: false };

function run(name, script, totalF = 900, logEvery = 0, mark = [], watch = "watergirl") {
  const w = makeWorld("forest_25");
  const trace = [];
  for (let f = 0; f < totalF; f++) {
    const inp = f < IDLE ? N : script(f - IDLE, w);
    w.step(1 / 60, { fireboy: inp, watergirl: inp });
    const p = w.snapshotPlayer(watch);
    trace.push({ f, x: px(p.x), y: px(p.y), vx: px(p.vx), vy: px(p.vy), anim: p.anim, ph: w.phase });
    if (p.dead || p.dying || w.phase !== "playing") break;
  }
  const last = trace[trace.length - 1];
  console.log(`\n== ${name} == frames=${trace.length} end=(${last.x},${last.y}) v=(${last.vx},${last.vy}) ${last.anim} ph=${last.ph}`);
  for (let i = 0; i < trace.length; i += logEvery) {
    const t = trace[i];
    if (t) console.log(`  f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy})`);
  }
  for (const mf of mark) {
    const t = trace[mf];
    if (t) console.log(`  *f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy})`);
  }
  return { trace, world: w };
}

// wg 协议：左 80f（到骑角），原地跳西（up+left 若干帧），落阶梯/池缘后看位置
for (const ULF of [30, 45, 60, 80]) {
  const r = run(`T4 骑角后 up+left ${ULF}f`, (f) => (f < 80 ? L : f < 80 + ULF ? UL : N), 700, 0, [80, 80 + ULF, 80 + ULF + 30, 80 + ULF + 60, 80 + ULF + 90, 80 + ULF + 120], "watergirl");
}

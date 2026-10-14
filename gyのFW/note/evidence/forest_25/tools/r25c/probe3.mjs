// r25c forest_25 内核探针 3：失速区起跳跨风墙 + 竖井翻落
// 用法: node --import tsx TEMP/r25c/probe3.mjs (在 gyのFW 根)
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const px = (n) => Math.round(n * 10) / 10;
const IDLE = 90;
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const U = { up: true, left: false, right: true };
const N = { up: false, left: false, right: false };

function run(name, script, totalF = 600, logEvery = 20, mark = []) {
  const w = makeWorld("forest_25");
  const trace = [];
  for (let f = 0; f < totalF; f++) {
    const inp = f < IDLE ? N : script(f - IDLE, w);
    w.step(1 / 60, { fireboy: inp, watergirl: inp });
    const fb = w.snapshotPlayer("fireboy");
    trace.push({ f, x: px(fb.x), y: px(fb.y), vx: px(fb.vx), vy: px(fb.vy), anim: fb.anim, ph: w.phase });
    if (fb.dead || fb.dying || w.phase !== "playing") break;
  }
  const last = trace[trace.length - 1];
  console.log(`\n== ${name} == frames=${trace.length} end=(${last.x},${last.y}) v=(${last.vx},${last.vy}) ${last.anim} ph=${last.ph}`);
  for (const mf of mark) {
    const t = trace[mf];
    if (t) console.log(`  *f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy})`);
  }
  return trace;
}

// ── T3: 一直右行进入失速振荡，然后在各帧起跳（up+right 保持到落地再松？先保持 60f 后松回 R）
for (const J of [560, 600, 640, 680, 720, 760]) {
  run(`T3 右行 F=${J} 起跳`, (f) => (f < 80 ? L : f < J ? R : f < J + 80 ? U : R), 900, 0, [J - 2, J, J + 20, J + 40, J + 60, J + 90, J + 120, J + 160]);
}

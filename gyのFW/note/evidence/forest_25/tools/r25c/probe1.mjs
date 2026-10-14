// r25c forest_25 内核探针 1：出生台西缘走落窗（probe3 复现+窗口测绘）
// 用法: node --import tsx TEMP/r25c/probe1.mjs (在 gyのFW 根)
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const px = (n) => Math.round(n * 10) / 10;
const IDLE = 90;

function run(name, script, totalF = 400, logEvery = 20) {
  const w = makeWorld("forest_25");
  const trace = [];
  for (let f = 0; f < totalF; f++) {
    const inp = f < IDLE ? { up: false, left: false, right: false } : script(f - IDLE, w);
    w.step(1 / 60, { fireboy: inp, watergirl: inp });
    const fb = w.snapshotPlayer("fireboy");
    trace.push({ f, x: fb.x, y: fb.y, vx: px(fb.vx), vy: px(fb.vy), anim: fb.anim, ph: w.phase });
    if (fb.dead || fb.dying || w.phase !== "playing") break;
  }
  const last = trace[trace.length - 1];
  console.log(`\n== ${name} == frames=${trace.length} end=(${px(last.x)},${px(last.y)}) vx=${last.vx} vy=${last.vy} ${last.anim} ph=${last.ph} dead=${last.dead} dying=${last.dying}`);
  for (let i = 0; i < trace.length; i += logEvery) {
    const t = trace[i];
    console.log(`  f${t.f}: (${px(t.x)},${px(t.y)}) v=(${t.vx},${t.vy}) ${t.anim}`);
  }
  return trace;
}

const L = { up: false, left: true, right: false };
const N = { up: false, left: false, right: false };

// T1: 走左 K 帧后松手（K 扫窗）——测走速与落 mesa/岸/悬停/死亡分岔
for (const K of [70, 75, 80, 85, 90, 95, 100, 105, 110, 120, 130, 140, 160, 200]) {
  run(`T1 K=${K}（左 ${K}f 后松）`, (f) => (f < K ? L : N), 400, 200);
}

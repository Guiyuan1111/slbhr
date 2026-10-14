// r25c forest_25 内核探针 2：mesa 逆风东行（P2）+ 跑跳东穿风墙
// 用法: node --import tsx TEMP/r25c/probe2.mjs (在 gyのFW 根)
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
    trace.push({ f, x: px(fb.x), y: px(fb.y), vx: px(fb.vx), vy: px(fb.vy), anim: fb.anim });
    if (fb.dead || fb.dying || w.phase !== "playing") break;
  }
  const last = trace[trace.length - 1];
  console.log(`\n== ${name} == frames=${trace.length} end=(${last.x},${last.y}) v=(${last.vx},${last.vy}) ${last.anim}`);
  for (let i = 0; i < trace.length; i += logEvery) {
    const t = trace[i];
    console.log(`  f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy}) ${t.anim}`);
  }
  for (const mf of mark) {
    const t = trace[mf];
    if (t) console.log(`  *f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy})`);
  }
  return trace;
}

// ── T2a: 角落站稳后（左80松→角）按右东行，看失速点
run("T2a 角落→右行 800f", (f) => (f < 80 ? L : f < 200 ? N : R), 900, 40);

// ── T2b: 角落→右行，到不同帧起跳（up+right），看跳跃落点
for (const J of [230, 250, 270, 290]) {
  run(`T2b 右行至相对f${J}起跳`, (f) => (f < 80 ? L : f < 200 ? N : f < J ? R : U), 700, 100, [200, J, J + 30, J + 60, J + 90]);
}

// auto 调研槽·基准实测 1：rollout 速度 / step 单帧 / makeWorld 构建 / reset 对比
// 用法: cd gyのFW && node --import tsx TEMP/auto/bench1.mjs
// 产出: JSON 数字打印到 stdout（收容进调研报告）
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { makeWorld, expandFlat } from "../../../../scripts/e2e/routetool/kernel.mjs";

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const stats = (a) => ({ n: a.length, med: +median(a).toFixed(3), min: +Math.min(...a).toFixed(3), max: +Math.max(...a).toFixed(3) });

const out = {};

// ---- 1. makeWorld 构建计时 ----
for (const level of ["forest_01", "forest_03"]) {
  const t = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const w = makeWorld(level);
    t.push(performance.now() - t0);
    if (i === 0) out[`${level}.bodies`] = (() => { let n = 0, b = w.built.world.GetBodyList(); while (b) { n++; b = b.GetNext(); } return n; })();
  }
  out[`${level}.makeWorld_ms`] = stats(t);
}

// ---- 2. 单步 step 计时（含/不含双角色 snapshot）----
{
  const w = makeWorld("forest_01");
  const inp = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
  // 预热 300 帧
  for (let i = 0; i < 300; i++) w.step(1 / 60, inp);
  // 纯 step
  let t0 = performance.now();
  const N = 3000;
  for (let i = 0; i < N; i++) w.step(1 / 60, inp);
  out.step_us_plain = +(((performance.now() - t0) / N) * 1000).toFixed(1);
  // step + snapshot×2（搜索内循环真实成本）
  t0 = performance.now();
  for (let i = 0; i < N; i++) {
    w.step(1 / 60, inp);
    w.snapshotPlayer("fireboy");
    w.snapshotPlayer("watergirl");
  }
  out.step_us_plus_snap = +(((performance.now() - t0) / N) * 1000).toFixed(1);
}

// ---- 3. 整关回放（固定输入，不提前退出=纯物理推进吞吐）----
function fixedRollout(level, frames) {
  const w = makeWorld(level);
  const inp = { fireboy: { up: false, left: true, right: false }, watergirl: { up: false, left: false, right: true } };
  const t0 = performance.now();
  let winF = -1;
  for (let f = 0; f < frames; f++) {
    w.step(1 / 60, inp);
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (winF < 0 && w.phase === "won") winF = f;
    if (a.dead || b.dead) break;
  }
  const ms = performance.now() - t0;
  return { ms: +ms.toFixed(1), frames: Math.min(frames, 1500), winF };
}

// forest_01 1500 帧固定输入完整回放 ×12
{
  const t = [];
  for (let i = 0; i < 12; i++) t.push(fixedRollout("forest_01", 1500).ms);
  out.forest_01_1500f_ms = stats(t);
}
// forest_03（风+机关）1500 帧 ×12
{
  const t = [];
  for (let i = 0; i < 12; i++) t.push(fixedRollout("forest_03", 1500).ms);
  out.forest_03_1500f_ms = stats(t);
}

// ---- 4. runKernel 真实路线回放（early-exit on WIN/death）----
{
  const { runKernel } = await import("../../../../scripts/e2e/routetool/kernel.mjs");
  for (const [level, path] of [["forest_01", "scripts/e2e/inputs/routes/forest_01.json"], ["forest_03", "scripts/e2e/inputs/routes/forest_03.json"]]) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const t = [], wins = [];
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      const r = runKernel(level, doc, {});
      t.push(performance.now() - t0);
      wins.push(r.won ? r.winF : `death@${r.deathF}`);
    }
    out[`${level}.routeReplay_ms`] = stats(t);
    out[`${level}.routeReplay_end`] = wins[0];
  }
}

// ---- 5. reset() vs makeWorld() ----
{
  const w = makeWorld("forest_01");
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) w.reset();
  out.reset_ms = +((performance.now() - t0) / 10).toFixed(2);
}

// ---- 6. 内存（粗测：构建 10 个 world 的堆增量）----
{
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const ws = [];
  for (let i = 0; i < 10; i++) ws.push(makeWorld("forest_01"));
  const delta = (process.memoryUsage().heapUsed - before) / 10 / 1024 / 1024;
  out.world_heap_MB_approx = +delta.toFixed(2);
  ws.length = 0;
}

console.log(JSON.stringify(out, null, 1));

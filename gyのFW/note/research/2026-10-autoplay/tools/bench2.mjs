// auto 调研槽·基准实测 2：严格分解（JIT 多轮预热）+ 并行吞吐 + 世界并行推进 + 确定性复核
// 用法: cd gyのFW && node --import tsx TEMP/auto/bench2.mjs
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { makeWorld, expandFlat, runKernel } from "../../../../scripts/e2e/routetool/kernel.mjs";
import { ScanPool } from "../../../../scripts/e2e/routetool/pool.mjs";

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};

// ---- 1. step 单帧计时：5 轮 × 3000 帧，报告每轮（观察 JIT 爬坡）----
{
  const w = makeWorld("forest_01");
  const inp = { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
  const rounds = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let i = 0; i < 3000; i++) w.step(1 / 60, inp);
    rounds.push(+((performance.now() - t0) / 3000 * 1000).toFixed(2));
  }
  out.step_us_rounds = rounds; // µs/帧，round0=冷
  out.step_us_warm_median = median(rounds.slice(1));
}

// ---- 2. runKernel 分解：world 构建 / expandFlat / 路线推进循环 ----
{
  const doc = JSON.parse(readFileSync("scripts/e2e/inputs/routes/forest_01.json", "utf8"));
  const total = doc.totalFrames;
  const t0 = performance.now();
  const ins = expandFlat(doc.fb, doc.wg, total);
  out.expandFlat_ms = +(performance.now() - t0).toFixed(2);
  const t1 = performance.now();
  const w = makeWorld("forest_01");
  out.makeWorld_ms_f01 = +(performance.now() - t1).toFixed(2);
  // 路线输入逐帧推进（与 runKernel 同负载：每帧双 snapshot，无 trace）
  const t2 = performance.now();
  let winF = -1;
  for (let f = 0; f < total; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (winF < 0 && w.phase === "won") winF = f;
    if (a.dead || a.dying || b.dead || b.dying) break;
  }
  const loopMs = performance.now() - t2;
  out.routeLoop_ms = +loopMs.toFixed(1);
  out.routeLoop_winF = winF;
  out.routeLoop_usPerFrame = +((loopMs / (winF + 1)) * 1000).toFixed(1);
}

// ---- 3. 并行吞吐：ScanPool(7) × 70 个 forest_01 路线回跑 ----
{
  const doc = JSON.parse(readFileSync("scripts/e2e/inputs/routes/forest_01.json", "utf8"));
  const pool = new ScanPool(7);
  const jobs = Array.from({ length: 70 }, () => ({ totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg }));
  const t0 = performance.now();
  const rs = await Promise.all(jobs.map((j) => pool.run("forest_01", j)));
  const ms = performance.now() - t0;
  pool.close();
  out.pool7_70jobs_ms = +ms.toFixed(0);
  out.pool7_jobsPerSec = +((70 / (ms / 1000))).toFixed(1);
  out.pool7_allWon = rs.every((r) => r.won);
}

// ---- 4. N 世界并行推进（beam search 内存式展开的成本形状）----
{
  const N = 50;
  const ws = Array.from({ length: N }, () => makeWorld("forest_01"));
  const inp = { fireboy: { up: false, left: true, right: false }, watergirl: { up: false, left: false, right: true } };
  // 预热
  for (const w of ws) w.step(1 / 60, inp);
  const t0 = performance.now();
  const FRAMES = 300;
  for (let f = 0; f < FRAMES; f++) for (const w of ws) w.step(1 / 60, inp);
  const perFrame = (performance.now() - t0) / (FRAMES * N) * 1000;
  out.parallel50_usPerFramePerWorld = +perFrame.toFixed(1);
}

// ---- 5. 确定性复核：同路线两次回跑末态位级一致 ----
{
  const doc = JSON.parse(readFileSync("scripts/e2e/inputs/routes/forest_01.json", "utf8"));
  const end = () => {
    const w = makeWorld("forest_01");
    const ins = expandFlat(doc.fb, doc.wg, doc.totalFrames);
    for (let f = 0; f < doc.totalFrames; f++) w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    return `${a.x},${a.y},${a.vx},${a.vy}|${b.x},${b.y},${b.vx},${b.vy}|${w.phase}`;
  };
  out.determinism_pair = end() === end() ? "IDENTICAL" : "DIVERGED";
  out.finalState = end();
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);

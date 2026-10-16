// auto 调研槽·基准实测 3：活跃 vs 睡眠体成本、池稳态吞吐、活跃并行世界
// 用法: cd gyのFW && node --import tsx TEMP/auto/bench3.mjs
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { makeWorld, expandFlat } from "../../../../scripts/e2e/routetool/kernel.mjs";
import { ScanPool } from "../../../../scripts/e2e/routetool/pool.mjs";

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};

const doc = JSON.parse(readFileSync("scripts/e2e/inputs/routes/forest_01.json", "utf8"));
const ins = expandFlat(doc.fb, doc.wg, doc.totalFrames);

// ---- 1. 真实路线回放 ×10（每次新世界，报告全部时点）----
{
  const t = [];
  for (let i = 0; i < 10; i++) {
    const w = makeWorld("forest_01");
    const t0 = performance.now();
    let winF = -1;
    for (let f = 0; f < doc.totalFrames; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
      if (winF < 0 && w.phase === "won") winF = f;
      if (a.dead || a.dying || b.dead || b.dying) break;
    }
    t.push(+(performance.now() - t0).toFixed(1));
  }
  out.routeLoop10_ms = t;
  out.routeLoop10_median = median(t);
  out.routeLoop10_usPerFrame = +((median(t) / 2365) * 1000).toFixed(1);
}

// ---- 2. 同一路线（活跃负载）去掉双 snapshot 的推进成本 ----
{
  const w = makeWorld("forest_01");
  const t0 = performance.now();
  let winF = -1;
  for (let f = 0; f < doc.totalFrames; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    if (winF < 0 && w.phase === "won") winF = f;
  }
  out.routeLoop_nosnap_ms = +(performance.now() - t0).toFixed(1);
  out.routeLoop_nosnap_winF = winF;
}

// ---- 3. 池稳态吞吐：预热批 70 + 稳态批 70（ScanPool(7)）----
{
  const pool = new ScanPool(7);
  const mk = () => Array.from({ length: 70 }, () => ({ totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg }));
  await Promise.all(mk().map((j) => pool.run("forest_01", j))); // 预热批（含 worker 启动）
  const t0 = performance.now();
  await Promise.all(mk().map((j) => pool.run("forest_01", j)));
  const ms = performance.now() - t0;
  pool.close();
  out.pool7_steady_70jobs_ms = +ms.toFixed(0);
  out.pool7_steady_jobsPerSec = +(70 / (ms / 1000)).toFixed(1);
}

// ---- 4. 50 世界并行 + 活跃路线输入（防睡眠，beam 内存式展开的真实成本）----
{
  const N = 50;
  const ws = Array.from({ length: N }, () => makeWorld("forest_01"));
  let t0 = performance.now();
  const FRAMES = 400;
  for (let f = 0; f < FRAMES; f++) {
    for (const [i, w] of ws.entries()) {
      const fi = (f + i * 7) % 2365; // 各世界相位错开→全部活跃
      w.step(1 / 60, { fireboy: ins.fb[fi], watergirl: ins.wg[fi] });
    }
  }
  out.parallel50_active_usPerFramePerWorld = +((performance.now() - t0) / (FRAMES * N) * 1000).toFixed(1);
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);

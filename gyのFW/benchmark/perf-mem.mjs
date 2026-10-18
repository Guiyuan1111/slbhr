/**
 * 内存基准：单 World 常驻 / 创建销毁吞吐 / 50 世界并发峰值（heapUsed 差分法）。
 *
 * 方法：
 * - 全程 global.gc()×2 强制回收后差分（需 --expose-gc；缺失时打印警告，数字噪声大仍照记）；
 * - 每 World 常驻 = K 个实例批量斜率（gc→heap0→建 K 个并各步 60 帧→gc→heap1，(heap1−heap0)/K），
 *   比单实例差分抗噪；
 * - 创建销毁吞吐 = new World + 60 步 + 弃引用 循环 N 次，另记首尾 gc 后 heapUsed 漂移（泄漏线索）；
 * - 并发峰值 = 50 世界同时持有 + 各步 60 帧，记 heap 峰值差分与 RSS。
 *
 * 用法：
 *   node --expose-gc --import tsx benchmark/perf-mem.mjs                     # 跑分打印
 *   node --expose-gc --import tsx benchmark/perf-mem.mjs --save <label>      # 存快照
 *   node --expose-gc --import tsx benchmark/perf-mem.mjs --compare <label>   # 与快照对比
 *   PERF_MEM_STEPS=60 PERF_MEM_CONCURRENT=50 可覆盖
 * 产物：benchmark/results/mem-<label>.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.PERF_MEM_STEPS ?? 60);
const K_SLOPE = 20;      // 斜率法批量
const N_CYCLES = 150;    // 创建销毁吞吐轮数
const N_CONCURRENT = Number(process.env.PERF_MEM_CONCURRENT ?? 50);
const LEVELS_SLOPE = ["forest_01", "forest_bonus_2"];

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

const gc = globalThis.gc;
if (!gc) console.warn("⚠ 未加 --expose-gc：无法强制回收，差分数字噪声大（建议 node --expose-gc --import tsx benchmark/perf-mem.mjs）");
const doGC = () => { if (gc) { gc(); gc(); } };
const heapUsed = () => process.memoryUsage().heapUsed;
const rss = () => process.memoryUsage().rss;
const MB = (b) => +(b / 1048576).toFixed(2);

const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function settleBaseline() {
  doGC();
  const h = heapUsed(), r = rss();
  return { heapUsedMB: MB(h), rssMB: MB(r), heapRaw: h };
}

// -------------------------------------------------- A. 每 World 常驻（K 实例斜率）
console.log(`\n== A. 每 World 常驻（${K_SLOPE} 实例斜率，各 ${STEPS} 步）==`);
const slopeRows = [];
for (const levelId of LEVELS_SLOPE) {
  const samples = [];
  for (let round = 0; round < 3; round++) {
    doGC();
    const h0 = heapUsed();
    const hold = [];
    for (let i = 0; i < K_SLOPE; i++) {
      const w = new World(loadLevel(levelId).level);
      for (let s = 0; s < STEPS; s++) w.step(1 / 60, inputs);
      hold.push(w); // 保持引用防逃逸
    }
    doGC();
    const h1 = heapUsed();
    samples.push((h1 - h0) / K_SLOPE);
    hold.length = 0;
    doGC();
  }
  const perWorld = median(samples);
  slopeRows.push({ levelId, k: K_SLOPE, steps: STEPS, perWorldHeapMB: MB(perWorld), samplesMB: samples.map((s) => MB(s)) });
  console.log(`${levelId.padEnd(16)} ≈${MB(perWorld)}MB/World（三轮 ${samples.map((s) => MB(s)).join(" / ")}）`);
}

// -------------------------------------------------- B. 创建销毁吞吐 + heap 漂移
console.log(`\n== B. 创建销毁吞吐（forest_01 × ${N_CYCLES}，各 ${STEPS} 步）==`);
const cycleRows = [];
for (let round = 0; round < 3; round++) {
  doGC();
  const h0 = heapUsed();
  const t0 = performance.now();
  for (let i = 0; i < N_CYCLES; i++) {
    const w = new World(loadLevel("forest_01").level);
    for (let s = 0; s < STEPS; s++) w.step(1 / 60, inputs);
  }
  const dt = performance.now() - t0;
  doGC();
  const h1 = heapUsed();
  cycleRows.push({
    msPerWorld: +(dt / N_CYCLES).toFixed(2),
    worldsPerSec: +((N_CYCLES / dt) * 1000).toFixed(1),
    heapDriftMB: MB(h1 - h0),
  });
}
const medCycle = {
  msPerWorld: median(cycleRows.map((r) => r.msPerWorld)),
  worldsPerSec: median(cycleRows.map((r) => r.worldsPerSec)),
  heapDriftMB: median(cycleRows.map((r) => r.heapDriftMB)),
};
console.log(`${medCycle.msPerWorld}ms/World（${medCycle.worldsPerSec}/s）· 三轮 heap 漂移 ${cycleRows.map((r) => r.heapDriftMB).join(" / ")}MB（中位 ${medCycle.heapDriftMB}MB，≈0 即无泄漏迹象）`);

// -------------------------------------------------- C. 50 世界并发峰值
console.log(`\n== C. ${N_CONCURRENT} 世界并发峰值（各 ${STEPS} 步）==`);
const concRows = [];
for (const levelId of ["forest_01", "forest_bonus_2"]) {
  const base = settleBaseline();
  const t0 = performance.now();
  const hold = [];
  for (let i = 0; i < N_CONCURRENT; i++) {
    const w = new World(loadLevel(levelId).level);
    for (let s = 0; s < STEPS; s++) w.step(1 / 60, inputs);
    hold.push(w);
  }
  const buildMs = performance.now() - t0;
  doGC();
  const peak = { heapUsedMB: MB(heapUsed()), rssMB: MB(rss()) };
  hold.length = 0;
  doGC();
  const after = { heapUsedMB: MB(heapUsed()), rssMB: MB(rss()) };
  concRows.push({
    levelId, n: N_CONCURRENT, steps: STEPS,
    peakHeapMB: peak.heapUsedMB,
    peakDeltaMB: MB(heapUsed() * 0 + (peak.heapUsedMB - base.heapUsedMB) * 1048576),
    perWorldHeapMB: +(((peak.heapUsedMB - base.heapUsedMB) * 1048576) / N_CONCURRENT / 1048576).toFixed(3),
    peakRssMB: peak.rssMB,
    buildMs: +buildMs.toFixed(0),
    afterReleaseHeapMB: after.heapUsedMB,
  });
  console.log(`${levelId.padEnd(16)} ×${N_CONCURRENT}：峰值 heap=${peak.heapUsedMB}MB（Δ=${concRows[concRows.length - 1].peakDeltaMB}MB，≈${concRows[concRows.length - 1].perWorldHeapMB}MB/World）RSS=${peak.rssMB}MB  构建总耗时=${buildMs.toFixed(0)}ms  释放后 heap=${after.heapUsedMB}MB`);
}

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0]?.model ?? "",
    loadavg: os.loadavg().map((v) => +v.toFixed(2)),
    exposeGc: !!gc,
    steps: STEPS,
    method: "global.gc×2 后 heapUsed 差分；常驻=20 实例斜率中位；吞吐=150 循环中位；并发=50 世界峰值",
  },
  baseline: settleBaseline(),
  slope: slopeRows,
  cycles: { n: N_CYCLES, median: medCycle, rounds: cycleRows },
  concurrent: concRows,
};

console.log("\n=== 汇总 ===");
console.log(`每 World 常驻：${slopeRows.map((r) => `${r.levelId}=${r.perWorldHeapMB}MB`).join(" · ")}`);
console.log(`创建销毁：${medCycle.msPerWorld}ms/World（${medCycle.worldsPerSec}/s）`);
console.log(`并发峰值：${concRows.map((r) => `${r.levelId}×${r.n}=Δ${r.peakDeltaMB}MB`).join(" · ")}`);

if (argSave) {
  writeFileSync(join(RESULTS, `mem-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`已存档 mem-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `mem-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  for (const cur of slopeRows) {
    const ref = base.slope?.find((r) => r.levelId === cur.levelId);
    if (ref) console.log(`常驻 ${cur.levelId}: ${ref.perWorldHeapMB} → ${cur.perWorldHeapMB}MB/World`);
  }
  if (base.cycles?.median) console.log(`创建销毁：${base.cycles.median.msPerWorld} → ${medCycle.msPerWorld}ms/World`);
  for (const cur of concRows) {
    const ref = base.concurrent?.find((r) => r.levelId === cur.levelId);
    if (ref) console.log(`并发峰值 ${cur.levelId}: Δ${ref.peakDeltaMB} → Δ${cur.peakDeltaMB}MB`);
  }
}

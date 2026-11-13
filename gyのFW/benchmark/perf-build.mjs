/**
 * r45 · World 构建纯基准（逐关 241 关全量，无物理步进掺入）。
 *
 * 为什么单独一件：`perf-switch.mjs` 量的是「换关链总成本」，每轮含 60 步物理 + 一次
 * 构建，构建占比被稀释（实测某项优化在 switch 口径下 −3.4%、在纯构建口径下 −11.8%，
 * 前者落在噪声内、后者两臂完全不重叠）。凡是**只作用于构建期**的改动（fixture 构造、
 * island 预分配、shape 模板），都必须用本件判定，不能用 switch 口径。
 *
 * 口径：
 * - 逐关 `new World(level)`（含 buildLevelWorld + buildMechanisms + 双 Character），
 *   按 id sort 序一轮跑完全部关卡；
 * - 预热 30 关后连续跑 ROUNDS 轮，取中位；每轮总耗时为观测量（241 关合计）；
 * - `--save/--compare` 存档到 `results/build-<label>.json`；
 * - 内存面：GC 后堆增量 / 单 world（`--mem` 才跑，需 --expose-gc）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-build.mjs [--save build-r45] [--compare build-r45]
 *   BUILD_ROUNDS=7          每轮 241 关，默认 7
 *   BUILD_LEVELS=ice_02,... 只跑指定关
 *   node --expose-gc --import tsx benchmark/perf-build.mjs --mem
 * 产物：benchmark/results/build-<label>.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const ROUNDS = Number(process.env.BUILD_ROUNDS ?? 7);
const WARMUP_LEVELS = 30;
const LEVEL_FILTER = process.env.BUILD_LEVELS
  ? process.env.BUILD_LEVELS.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const argMem = process.argv.includes("--mem");

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
}

let ids = listLevelIds().sort();
if (LEVEL_FILTER) {
  const set = new Set(LEVEL_FILTER);
  ids = ids.filter((id) => set.has(id));
  if (ids.length === 0) throw new Error(`BUILD_LEVELS=${LEVEL_FILTER.join(",")}: 无匹配关卡`);
}
const levels = ids.map((id) => loadLevel(id).level);

console.log(`r45 构建纯基准：${ids.length} 关 × ${ROUNDS} 轮（预热 ${Math.min(WARMUP_LEVELS, ids.length)} 关），node ${process.version}`);

// 预热：填 JIT、b2 单例、各关 parse 缓存（不参与计时）
for (const L of levels.slice(0, WARMUP_LEVELS)) new World(L);

const totals = [];
for (let r = 0; r < ROUNDS; r++) {
  const t0 = performance.now();
  for (const L of levels) new World(L);
  totals.push(+(performance.now() - t0).toFixed(2));
}
const medTotal = median(totals);
const sMin = Math.min(...totals);
const sMax = Math.max(...totals);
console.log(
  `  241 关合计中位 ${medTotal.toFixed(2)}ms（${(medTotal / ids.length).toFixed(3)}ms/关）` +
    `  区间 [${sMin.toFixed(2)}, ${sMax.toFixed(2)}]  散布 ${(sMax - sMin).toFixed(2)}ms`,
);

// 内存面（可选）：GC 后建 N 个 world 的净堆增量
let memKBPerWorld = null;
if (argMem) {
  if (typeof global.gc !== "function") throw new Error("--mem 需 --expose-gc");
  const N = 30;
  const probe = levels[0];
  for (let i = 0; i < 10; i++) new World(probe); // 预热
  global.gc();
  const h0 = process.memoryUsage().heapUsed;
  const held = [];
  for (let i = 0; i < N; i++) held.push(new World(probe));
  global.gc();
  const h1 = process.memoryUsage().heapUsed;
  memKBPerWorld = +((h1 - h0) / N / 1024).toFixed(1);
  console.log(`  单 world 常驻 ≈ ${memKBPerWorld} KiB（${N} 个净堆增量 / ${N}，GC 后；样本关 ${ids[0]}）`);
  held.length = 0;
}

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    rounds: ROUNDS,
    levels: ids.length,
    node: process.version,
  },
  overall: {
    totalMedMs: +medTotal.toFixed(2),
    perLevelMs: +(medTotal / ids.length).toFixed(4),
    minMs: +sMin.toFixed(2),
    maxMs: +sMax.toFixed(2),
    spreadMs: +(sMax - sMin).toFixed(2),
    memKBPerWorld,
  },
  totals,
};

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `build-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`\n已存档 build-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `build-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  if (base.meta.levels !== ids.length) {
    throw new Error(`关卡数不一致（快照 ${base.meta.levels} vs 本次 ${ids.length}），换 BUILD_LEVELS 重跑`);
  }
  const b = base.overall;
  const d = ((payload.overall.totalMedMs - b.totalMedMs) / b.totalMedMs) * 100;
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  console.log(`  合计中位：${b.totalMedMs.toFixed(2)} → ${payload.overall.totalMedMs.toFixed(2)}ms（${d >= 0 ? "+" : ""}${d.toFixed(2)}%）`);
  console.log(`  每关均摊：${b.perLevelMs.toFixed(4)} → ${payload.overall.perLevelMs.toFixed(4)}ms`);
  if (b.memKBPerWorld !== null && payload.overall.memKBPerWorld !== null) {
    console.log(`  单 world 常驻：${b.memKBPerWorld} → ${payload.overall.memKBPerWorld} KiB`);
  }
  console.log(`  （噪声参照：本次散布 ${payload.overall.spreadMs.toFixed(2)}ms、快照散布 ${b.spreadMs.toFixed(2)}ms）`);
}

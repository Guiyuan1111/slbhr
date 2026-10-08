/**
 * 服务端物理 step 性能基准：全部关卡构建 + 空载步进计时（JIT 预热后）。
 * 衡量优化前后的单步耗时 / 每仿真秒物理占用 / 60Hz 预算余量。
 *
 * 用法：
 *   node --import tsx benchmark/perf-step.mjs                       # 跑分打印
 *   node --import tsx benchmark/perf-step.mjs --save <label>        # 存快照
 *   node --import tsx benchmark/perf-step.mjs --compare <label>     # 与快照对比（前后表）
 *   PERF_STEPS=600 PERF_LEVELS=forest_bonus_2,forest_01 node ...    # 步数/关卡过滤
 * 产物：benchmark/results/perf-<label>.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.PERF_STEPS ?? 600);
const WARMUP = 90;
const FILTER = process.env.PERF_LEVELS ? process.env.PERF_LEVELS.split(",").map((s) => s.trim()) : undefined;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  return { avg, p50: q(50), p95: q(95), p99: q(99), max: s[s.length - 1] };
}

let ids = listLevelIds().sort();
if (FILTER) ids = ids.filter((id) => FILTER.includes(id));
console.log(`关卡 ${ids.length} 个 × ${STEPS} 步（预热 ${WARMUP}）`);
const rows = [];
const allStepMs = [];
for (const id of ids) {
  const t0 = performance.now();
  const w = new World(loadLevel(id).level);
  const buildMs = performance.now() - t0;
  for (let i = 0; i < WARMUP; i++) w.step(1 / 60, inputs);
  const stepMs = new Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const t = performance.now();
    w.step(1 / 60, inputs);
    stepMs[i] = performance.now() - t;
  }
  const st = stats(stepMs);
  const r = {
    id,
    buildMs: +buildMs.toFixed(1),
    stepAvgMs: +st.avg.toFixed(4),
    stepP95Ms: +st.p95.toFixed(4),
    stepP99Ms: +st.p99.toFixed(4),
    stepMaxMs: +st.max.toFixed(4),
    /** 每仿真秒物理占用（60 步合计, ms）——>1000 即跑不满实时 */
    physMsPerSimSec: +(st.avg * 60).toFixed(2),
    budgetHeadroom60hz: +((1000 / 60 - st.avg) * 1000).toFixed(0) / 1000,
  };
  rows.push(r);
  for (const v of stepMs) allStepMs.push(v);
  console.log(
    `${id.padEnd(22)} build=${buildMs.toFixed(0).padStart(4)}ms avg=${st.avg.toFixed(4).padStart(8)} p95=${st.p95.toFixed(4).padStart(8)} 60步=${(st.avg * 60).toFixed(2).padStart(8)}ms`,
  );
}
const overall = stats(allStepMs);
const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    steps: STEPS,
    levels: ids.length,
    node: process.version,
  },
  overall: {
    stepAvgMs: +overall.avg.toFixed(4),
    stepP50Ms: +overall.p50.toFixed(4),
    stepP95Ms: +overall.p95.toFixed(4),
    stepP99Ms: +overall.p99.toFixed(4),
    physMsPerSimSecAll: +(overall.avg * 60).toFixed(2),
  },
  rows,
};

console.log("\n=== 汇总 ===");
console.log(`全 ${ids.length} 关合计：avg=${overall.avg.toFixed(4)}ms p50=${overall.p50.toFixed(4)}ms p95=${overall.p95.toFixed(4)}ms p99=${overall.p99.toFixed(4)}ms max=${overall.max.toFixed(3)}ms`);
const slowest = [...rows].sort((a, b) => b.stepAvgMs - a.stepAvgMs).slice(0, 5);
console.log(`最慢 5 关：${slowest.map((r) => `${r.id}=${r.stepAvgMs}ms`).join("  ")}`);

if (argSave) {
  writeFileSync(join(RESULTS, `perf-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`已存档 perf-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `perf-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  const head = "关卡".padEnd(22) + "avg 前→后".padEnd(24) + "Δ%".padStart(8) + "   60步 前→后";
  console.log(head);
  for (const cur of rows) {
    const ref = base.rows.find((r) => r.id === cur.id);
    if (!ref) { console.log(`${cur.id.padEnd(22)}（快照缺失）`); continue; }
    const d = ((cur.stepAvgMs - ref.stepAvgMs) / ref.stepAvgMs) * 100;
    console.log(
      `${cur.id.padEnd(22)} ${ref.stepAvgMs.toFixed(4).padStart(9)} → ${cur.stepAvgMs.toFixed(4).padStart(9)} ${d >= 0 ? "+" : ""}${d.toFixed(1).padStart(6)}%   ${ref.physMsPerSimSec.toFixed(1).padStart(7)} → ${cur.physMsPerSimSec.toFixed(1)}`,
    );
  }
  const ovD = ((payload.overall.stepAvgMs - base.overall.stepAvgMs) / base.overall.stepAvgMs) * 100;
  console.log(`综合 avg：${base.overall.stepAvgMs.toFixed(4)} → ${payload.overall.stepAvgMs.toFixed(4)}（${ovD >= 0 ? "+" : ""}${ovD.toFixed(1)}%）`);
}

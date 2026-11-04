/**
 * r44 六部全库性能基准（覆盖 forest/light/ice/crystal/elements/fairytales）。
 *
 * 目的：2026-10-18 起的性能战役 r0–r43 只覆盖前三部（139 关）；第四–六部与 portal/
 * 仙女/复活内核是 2026-10-30 之后新入库的代码，从未进入任何性能基线。本件把全部
 * 241 关纳入统一口径，并按"部"聚合，避免 241 关均值被轻关稀释掩盖分部差异。
 *
 * 三个测量面：
 *   1. step       —— World.step 单步耗时（idle 与 scripted 双输入，逐关）
 *   2. build      —— World 构建耗时（机器探索/换关链的供给面）
 *   3. alloc      —— 稳态每步净分配字节（--expose-gc，GC 前后堆差 / 步数）
 *
 * 用法：
 *   node --expose-gc --import tsx benchmark/perf-r44.mjs                      # 跑分打印
 *   node --expose-gc --import tsx benchmark/perf-r44.mjs --save r44-baseline  # 存档
 *   node --expose-gc --import tsx benchmark/perf-r44.mjs --compare r44-baseline
 *   PERF_R44_TEMPLE=crystal,fairies   只跑指定部
 *   PERF_R44_STEPS=1200 PERF_R44_ALLOC_STEPS=3000
 * 产物：benchmark/results/r44-<label>.json（与 perf-*.json 分开命名，互不覆盖）
 *
 * 口径纪律（沿用战役支柱 2）：
 * - 计时一律 JIT 预热后测量；空载与 scripted 分列（负载差 2–6×，r0 实证）
 * - 分配量用 GC 前/后堆差而非采样（typed array 大块对采样器失明，r14 实证）
 * - 跨轮对比只认同日同机配对；本件 --compare 输出 Δ% 仅作方向指引，
 *   判定以 det 位级门禁 + 三次复跑中位为准
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");

const STEPS = Number(process.env.PERF_R44_STEPS ?? 600);
const ALLOC_STEPS = Number(process.env.PERF_R44_ALLOC_STEPS ?? 2400);
const WARMUP = 300;
const TEMPLE_FILTER = process.env.PERF_R44_TEMPLE
  ? process.env.PERF_R44_TEMPLE.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

/** 关卡 id → 部。elements 部的 id 形如 efire_1 / ewater_2 / ecrystal_Portals_1；
 *  教学关 e_tutorial_* 归 elements（其数据在 tutorials/ 但属元素合集的教学线）。 */
function templeOf(id) {
  if (id.startsWith("forest")) return "forest";
  if (id.startsWith("light")) return "light";
  if (id.startsWith("ice")) return "ice";
  if (id.startsWith("crystal")) return "crystal";
  if (id.startsWith("fairies")) return "fairytales";
  if (id.startsWith("e_tutorial")) return "elements";
  if (/^e(?:fire|water|forest|ice|light|wind|crystal)_/.test(id)) return "elements";
  return "other";
}

const IDLE = { up: false, left: false, right: false };
const SCRIPTED = { up: false, left: false, right: false };

/** scripted 输入脚本：周期走/跳（与 perf-determinism 同式，无 RNG） */
function inputAt(frame) {
  const ph = frame % 96;
  const right = ph < 40;
  const left = ph >= 48 && ph < 78;
  const up = ph % 24 === 0;
  SCRIPTED.up = up;
  SCRIPTED.left = left;
  SCRIPTED.right = right;
  return { fireboy: SCRIPTED, watergirl: { up, left, right } };
}
const IDLE_INPUTS = { fireboy: IDLE, watergirl: { up: false, left: false, right: false } };

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  return { avg, p50: q(50), p95: q(95), p99: q(99), max: s[s.length - 1] };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
}

const gc = () => {
  if (typeof global.gc === "function") {
    global.gc();
    return true;
  }
  return false;
};
const hasGc = gc();

let ids = listLevelIds().sort();
if (TEMPLE_FILTER) {
  const set = new Set(TEMPLE_FILTER);
  ids = ids.filter((id) => set.has(templeOf(id)));
  if (ids.length === 0) throw new Error(`PERF_R44_TEMPLE=${TEMPLE_FILTER.join(",")}: 无匹配关卡`);
}

console.log(
  `r44 基准：${ids.length} 关 × step ${STEPS}（预热 ${WARMUP}）` +
    `，alloc ${hasGc ? ALLOC_STEPS + " 步" : "跳过（需 --expose-gc）"}`,
);

const rows = [];
for (const id of ids) {
  const level = loadLevel(id).level;

  // ---- build：中位 3 次（首次含模块级 cache 填充，单独丢弃）
  const tBuild0 = performance.now();
  new World(level);
  const buildWarm = performance.now() - tBuild0;
  const builds = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    new World(level);
    builds.push(performance.now() - t);
  }

  // ---- step：idle 与 scripted 各一轮，同一 world 上先预热
  const w = new World(level);
  for (let i = 0; i < WARMUP; i++) w.step(1 / 60, IDLE_INPUTS);
  const idleMs = new Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const t = performance.now();
    w.step(1 / 60, IDLE_INPUTS);
    idleMs[i] = performance.now() - t;
  }

  const w2 = new World(level);
  for (let i = 0; i < WARMUP; i++) w2.step(1 / 60, inputAt(i));
  const scrMs = new Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const t = performance.now();
    w2.step(1 / 60, inputAt(i + WARMUP));
    scrMs[i] = performance.now() - t;
  }

  // ---- alloc：稳态净分配（GC 前后堆差；不含世界构建）
  let allocBPerStep = null;
  if (hasGc) {
    const wa = new World(level);
    for (let i = 0; i < WARMUP; i++) wa.step(1 / 60, inputAt(i));
    gc();
    const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < ALLOC_STEPS; i++) wa.step(1 / 60, inputAt(i + WARMUP));
    gc();
    const h1 = process.memoryUsage().heapUsed;
    allocBPerStep = +((h1 - h0) / ALLOC_STEPS).toFixed(1);
  }

  const si = stats(idleMs);
  const ss = stats(scrMs);
  rows.push({
    id,
    temple: templeOf(id),
    buildMs: +median(builds).toFixed(3),
    buildFirstMs: +buildWarm.toFixed(3),
    idleAvgMs: +si.avg.toFixed(5),
    idleP95Ms: +si.p95.toFixed(5),
    scrAvgMs: +ss.avg.toFixed(5),
    scrP95Ms: +ss.p95.toFixed(5),
    scrPhysMsPerSimSec: +(ss.avg * 60).toFixed(2),
    allocBPerStep,
  });
}

/** 按部聚合：均值取部内关均值，p95 取部内关 p95 的中位（避免个别重关主导） */
const temples = {};
for (const r of rows) {
  const t = (temples[r.temple] ??= { levels: 0, idle: [], scr: [], scrP95: [], build: [], alloc: [] });
  t.levels++;
  t.idle.push(r.idleAvgMs);
  t.scr.push(r.scrAvgMs);
  t.scrP95.push(r.scrP95Ms);
  t.build.push(r.buildMs);
  if (r.allocBPerStep !== null) t.alloc.push(r.allocBPerStep);
}
const byTemple = {};
for (const [name, t] of Object.entries(temples).sort((a, b) => a[0].localeCompare(b[0]))) {
  byTemple[name] = {
    levels: t.levels,
    idleAvgMs: +(t.idle.reduce((a, b) => a + b, 0) / t.idle.length).toFixed(5),
    scrAvgMs: +(t.scr.reduce((a, b) => a + b, 0) / t.scr.length).toFixed(5),
    scrP95Ms: +median(t.scrP95).toFixed(5),
    buildMs: +median(t.build).toFixed(3),
    allocBPerStep: t.alloc.length ? +median(t.alloc).toFixed(1) : null,
  };
}

const allIdle = stats(rows.map((r) => r.idleAvgMs));
const allScr = stats(rows.map((r) => r.scrAvgMs));
const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    steps: STEPS,
    allocSteps: hasGc ? ALLOC_STEPS : null,
    levels: ids.length,
    temples: Object.keys(byTemple),
    node: process.version,
  },
  overall: {
    idleAvgMs: +allIdle.avg.toFixed(5),
    idleP50Ms: +allIdle.p50.toFixed(5),
    idleP95Ms: +allIdle.p95.toFixed(5),
    scrAvgMs: +allScr.avg.toFixed(5),
    scrP50Ms: +allScr.p50.toFixed(5),
    scrP95Ms: +allScr.p95.toFixed(5),
  },
  byTemple,
  rows,
};

console.log("\n===== 分部聚合 =====");
console.log("部".padEnd(12) + "关数".padStart(5) + "idle avg".padStart(12) + "scripted avg".padStart(15) + "scripted p95".padStart(14) + "build".padStart(10) + "alloc".padStart(12));
for (const [name, v] of Object.entries(byTemple)) {
  console.log(
    name.padEnd(12) +
      String(v.levels).padStart(5) +
      v.idleAvgMs.toFixed(5).padStart(12) +
      v.scrAvgMs.toFixed(5).padStart(15) +
      v.scrP95Ms.toFixed(5).padStart(14) +
      `${v.buildMs.toFixed(2)}ms`.padStart(10) +
      (v.allocBPerStep === null ? "-" : `${v.allocBPerStep}B`).padStart(12),
  );
}
console.log(
  `\n全 ${rows.length} 关：idle avg=${allIdle.avg.toFixed(5)}ms  scripted avg=${allScr.avg.toFixed(5)}ms  p95=${allScr.p95.toFixed(5)}ms`,
);
const slow = [...rows].sort((a, b) => b.scrAvgMs - a.scrAvgMs).slice(0, 8);
console.log(`最慢 8 关（scripted）：${slow.map((r) => `${r.id}=${r.scrAvgMs}ms`).join("  ")}`);

if (argSave) {
  writeFileSync(join(RESULTS, `r44-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`已存档 r44-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `r44-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  if (base.meta.steps !== STEPS) {
    throw new Error(`step 口径不一致（快照 ${base.meta.steps} vs 本次 ${STEPS}），换 PERF_R44_STEPS 重跑`);
  }
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  console.log("部".padEnd(12) + "scripted 前→后".padEnd(28) + "Δ%".padStart(8) + "   idle 前→后".padEnd(26) + "Δ%".padStart(8));
  for (const [name, cur] of Object.entries(byTemple)) {
    const ref = base.byTemple[name];
    if (!ref) {
      console.log(`${name.padEnd(12)}（快照无此部）`);
      continue;
    }
    const ds = ((cur.scrAvgMs - ref.scrAvgMs) / ref.scrAvgMs) * 100;
    const di = ((cur.idleAvgMs - ref.idleAvgMs) / ref.idleAvgMs) * 100;
    console.log(
      name.padEnd(12) +
        `${ref.scrAvgMs.toFixed(5)} → ${cur.scrAvgMs.toFixed(5)}`.padEnd(28) +
        `${ds >= 0 ? "+" : ""}${ds.toFixed(1)}%`.padStart(8) +
        `  ${ref.idleAvgMs.toFixed(5)} → ${cur.idleAvgMs.toFixed(5)}`.padEnd(26) +
        `${di >= 0 ? "+" : ""}${di.toFixed(1)}%`.padStart(8),
    );
  }
  const dsAll = ((payload.overall.scrAvgMs - base.overall.scrAvgMs) / base.overall.scrAvgMs) * 100;
  console.log(`\n全库 scripted avg：${base.overall.scrAvgMs.toFixed(5)} → ${payload.overall.scrAvgMs.toFixed(5)}（${dsAll >= 0 ? "+" : ""}${dsAll.toFixed(2)}%）`);
  // 逐关反向（回归）清单：Δ>+5% 且绝对差 >0.002ms 的关
  const regr = [];
  for (const cur of rows) {
    const ref = base.rows.find((r) => r.id === cur.id);
    if (!ref) continue;
    const d = ((cur.scrAvgMs - ref.scrAvgMs) / ref.scrAvgMs) * 100;
    if (d > 5 && cur.scrAvgMs - ref.scrAvgMs > 0.002) regr.push(`${cur.id}(+${d.toFixed(0)}%)`);
  }
  console.log(regr.length ? `\n⚠ 单关回归 >5%：${regr.slice(0, 20).join(" ")}${regr.length > 20 ? ` …共 ${regr.length} 关` : ""}` : "\n✓ 无单关回归 >5%");
}

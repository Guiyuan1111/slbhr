/**
 * 路线回放/IO 吞吐基准：routetool 的 makeWorld + 整关事件回放（kernel.mjs 只读 import，
 * 与 validate/门禁 runner 同一条产线）。机器探索（autosearch 等）的供给面量化。
 *
 * 三个口径：
 * - runKernel 整关回放：expandFlat 输入展开 + makeWorld + 逐帧 step + 双角色快照死亡/胜利
 *   判定（含提前终止）——门禁/validate 的真实路径。产出 回放耗时分布、整关回放数/秒、帧/秒。
 * - 纯 step 环：输入预展开、无快照/判定开销，跑满 totalFrames——物理裸吞吐（每帧 µs）。
 * - makeWorld 构建吞吐：世界创建/销毁（探索线每次试验一个实例）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-routeio.mjs                     # 跑分打印
 *   node --import tsx benchmark/perf-routeio.mjs --save <label>      # 存快照
 *   node --import tsx benchmark/perf-routeio.mjs --compare <label>   # 与快照对比
 *   PERF_ROUTES=forest_01,forest_12 PERF_RR_RUNS=12 可覆盖路线集/轮数
 * 产物：benchmark/results/routeio-<label>.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";
import { makeWorld, runKernel, expandFlat } from "../scripts/e2e/routetool/kernel.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const ROUTES_DIR = join(ROOT, "scripts", "e2e", "inputs", "routes");
const ROUTES = process.env.PERF_ROUTES
  ? process.env.PERF_ROUTES.split(",").map((s) => s.trim())
  : ["forest_01", "forest_02", "forest_03", "forest_04", "forest_05", "forest_06", "forest_06_1", "forest_07", "forest_12", "forest_15", "forest_26", "forest_32"];
const RUNS = Number(process.env.PERF_RR_RUNS ?? 12);
const BUILD_RUNS = 20;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  return { avg, p50: q(50), p95: q(95), p99: q(99), max: s[s.length - 1] };
}

const rows = [];
for (const level of ROUTES) {
  const fp = join(ROUTES_DIR, `${level}.json`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(fp, "utf8"));
  } catch {
    console.log(`${level.padEnd(16)} （路线不存在，跳过）`);
    continue;
  }
  const total = doc.totalFrames;

  // 预热 1 次整关回放 + 记录结局（结局只影响回放帧数，不影响吞吐口径）
  const warm = runKernel(level, doc);

  // runKernel 整关回放（门禁/validate 真实路径）
  const replayMs = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    runKernel(level, doc);
    replayMs.push(performance.now() - t);
  }
  const rr = stats(replayMs);
  const framesRun = warm.won ? warm.winF + 1 : warm.deathF >= 0 ? warm.deathF + 1 : total;

  // 纯 step 环（输入预展开、无快照/判定；跑满 totalFrames）
  const ins = expandFlat(doc.fb, doc.wg, total);
  const rawMs = [];
  for (let i = 0; i < RUNS; i++) {
    const w = makeWorld(level);
    const t = performance.now();
    for (let f = 0; f < total; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    }
    rawMs.push(performance.now() - t);
  }
  const rw = stats(rawMs);

  // makeWorld 构建吞吐
  for (let i = 0; i < 3; i++) makeWorld(level);
  const buildMs = [];
  for (let i = 0; i < BUILD_RUNS; i++) {
    const t = performance.now();
    makeWorld(level);
    buildMs.push(performance.now() - t);
  }
  const rb = stats(buildMs);

  const row = {
    level,
    totalFrames: total,
    outcome: warm.won ? `win@${warm.winF}` : warm.deathF >= 0 ? `death@${warm.deathF}` : "timeout",
    framesRun,
    replayAvgMs: +rr.avg.toFixed(2), replayP95Ms: +rr.p95.toFixed(2),
    /** 整关回放数/秒（门禁 runner 的吞吐供给面） */
    replaysPerSec: +(1000 / rr.p50).toFixed(2),
    framesPerSec: +((framesRun / rr.p50) * 1000).toFixed(0),
    replayFrameUs: +((rr.p50 * 1000) / framesRun).toFixed(1),
    rawAvgMs: +rw.avg.toFixed(2),
    rawFrameUs: +((rw.p50 * 1000) / total).toFixed(1),
    rawFramesPerSec: +((total / rw.p50) * 1000).toFixed(0),
    buildAvgMs: +rb.avg.toFixed(2), buildP95Ms: +rb.p95.toFixed(2),
    buildsPerSec: +(1000 / rb.p50).toFixed(1),
  };
  rows.push(row);
  console.log(
    `${level.padEnd(16)} ${String(total).padStart(5)}f ${row.outcome.padEnd(10)} 回放p50=${rr.p50.toFixed(1)}ms（${row.replaysPerSec}关/s ${row.framesPerSec}f/s 帧耗=${row.replayFrameUs}µs）  纯step=${row.rawFrameUs}µs/f（${row.rawFramesPerSec}f/s）  build=${row.buildAvgMs}ms（${row.buildsPerSec}/s）`,
  );
}

const aggFramesPerSec = rows.reduce((s, r) => s + r.framesPerSec, 0) / Math.max(1, rows.length);
const aggReplays = rows.reduce((s, r) => s + r.replaysPerSec, 0) / Math.max(1, rows.length);
console.log(`\n=== 汇总（${rows.length} 路线均值）===`);
console.log(`整关回放 ${aggReplays.toFixed(2)} 关/s · ${aggFramesPerSec.toFixed(0)} 帧/s（含判定）| 世界构建 ${rows.reduce((s, r) => s + r.buildsPerSec, 0) / Math.max(1, rows.length).toFixed(1)}/s`);

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0]?.model ?? "",
    loadavg: os.loadavg().map((v) => +v.toFixed(2)),
    runs: RUNS,
    routes: ROUTES.join(","),
  },
  summary: { replaysPerSec: +aggReplays.toFixed(2), framesPerSec: +aggFramesPerSec.toFixed(0) },
  rows,
};

if (argSave) {
  writeFileSync(join(RESULTS, `routeio-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`已存档 routeio-${argSave}.json`);
}
if (argCompare) {
  const fp2 = join(RESULTS, `routeio-${argCompare}.json`);
  if (!existsSync(fp2)) throw new Error(`快照不存在: ${fp2}`);
  const base = JSON.parse(readFileSync(fp2, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  for (const cur of rows) {
    const ref = base.rows.find((r) => r.level === cur.level);
    if (!ref) { console.log(`${cur.level}: 快照缺失`); continue; }
    const d = ((cur.replayFrameUs - ref.replayFrameUs) / ref.replayFrameUs) * 100;
    console.log(`${cur.level.padEnd(16)} 帧耗 ${ref.replayFrameUs} → ${cur.replayFrameUs}µs（${d >= 0 ? "+" : ""}${d.toFixed(1)}%）  build ${ref.buildAvgMs} → ${cur.buildAvgMs}ms`);
  }
  console.log(`汇总：${base.summary.replaysPerSec} → ${payload.summary.replaysPerSec} 关/s`);
}

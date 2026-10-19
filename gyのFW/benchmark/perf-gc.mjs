/**
 * GC 拆账基准（r11）：50 并发构建膨胀（~166ms/World vs 冷建 ~14ms）的暂停归因。
 *
 * r0 §八挂账：perf-mem 场景 C（持有 50 世界连建）单建成本膨胀 10×+，GC 暂停未拆账。
 * 本件以 perf_hooks PerformanceObserver('gc') 逐事件采集（startTime/duration 与
 * performance.now() 同钟），按每个 World 构建窗口归账：
 *   - B 冷跑（不持有，150 循环）与 C 持有（50 并发）各跑，对照每建墙钟与 GC 份额；
 *   - 输出 major/minor 次数与暂停合计、GC 占墙钟比例、构建耗时随序号的趋势（后半
 *     变贵=堆压力效应；平稳=分配器/页错误归因）。
 * 用法：
 *   node --expose-gc --import tsx benchmark/perf-gc.mjs --save <label>
 *   node --expose-gc --import tsx benchmark/perf-gc.mjs --compare <label>
 * 产物：benchmark/results/gc-<label>.json
 */
import { performance, PerformanceObserver } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.PERF_MEM_STEPS ?? 60);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const log = (...a) => console.log("[gc]", ...a);
const MB = (b) => +(b / 1048576).toFixed(2);
const gc = globalThis.gc;
const doGC = () => { if (gc) { gc(); gc(); } };
const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };

// GC 事件全采集（startTime 与 performance.now() 同钟）
const gcEvents = [];
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) gcEvents.push({ start: e.startTime, dur: e.duration, kind: e.detail ? e.detail.kind : 0 });
}).observe({ type: "gc", buffered: true });
// detail.kind：1=minor(scavenge) 4=major(MarkSweepCompact)（Node perf_hooks GCDetail）

const flush = () => new Promise((r) => setImmediate(() => setImmediate(r)));
/** 等观察器投递：PerformanceObserver 回调挂在事件循环上，同步块内不触发——
 *  buildN 全同步跑完后必须 await 冲刷再归账（r11 首版量具哑火根因） */

/** 建 n 个世界（hold=true 保持引用），逐建记墙钟窗口，返回 {windows, hold?} */
function buildN(levelId, n, hold) {
  const windows = [];
  const holdArr = hold ? [] : null;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const w = new World(loadLevel(levelId).level);
    for (let s = 0; s < STEPS; s++) w.step(1 / 60, inputs);
    windows.push({ i, t0, t1: performance.now() });
    if (holdArr) holdArr.push(w);
  }
  return { windows, holdArr };
}

/** 把 GC 事件按窗口归账（暂停与窗口相交时长算入该窗口；窗外单独计） */
function attribute(windows) {
  const per = windows.map((w) => ({ i: w.i, wallMs: +(w.t1 - w.t0).toFixed(2), gcMs: 0, nGC: 0, nMajor: 0 }));
  const idx = new Map(per.map((p) => [p.i, p]));
  let outsideMs = 0, outsideN = 0;
  for (const ev of gcEvents) {
    const e0 = ev.start, e1 = ev.start + ev.dur;
    let hit = false;
    for (const w of windows) {
      if (e1 <= w.t0) continue;
      if (e0 >= w.t1) break;
      const overlap = Math.min(e1, w.t1) - Math.max(e0, w.t0);
      if (overlap > 0) {
        const p = idx.get(w.i);
        p.gcMs += overlap;
        p.nGC++;
        if (ev.kind === 4) p.nMajor++;
        hit = true;
      }
    }
    if (!hit) { outsideMs += ev.dur; outsideN++; }
  }
  for (const p of per) p.gcMs = +p.gcMs.toFixed(2);
  return { per, outsideMs: +outsideMs.toFixed(1), outsideN };
}

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(2); };

const out = {};

// B 冷跑（不持有）：150×forest_01
gcEvents.length = 0;
doGC();
let r = buildN("forest_01", 150, false);
await flush();
let a = attribute(r.windows);
out.churn = {
  level: "forest_01", n: 150,
  wallPerWorldMs: med(a.per.map((p) => p.wallMs)),
  gcPerWorldMs: +(a.per.reduce((s, p) => s + p.gcMs, 0) / a.per.length).toFixed(2),
  gcSharePct: +((a.per.reduce((s, p) => s + p.gcMs, 0) / a.per.reduce((s, p) => s + p.wallMs, 0)) * 100).toFixed(1),
  totalGcMs: +gcEvents.reduce((s, e) => s + e.dur, 0).toFixed(1),
  majorCount: gcEvents.filter((e) => e.kind === 4).length,
  minorCount: gcEvents.filter((e) => e.kind === 1).length,
};
log(`B 冷跑 f01×150: ${out.churn.wallPerWorldMs}ms/建  GC ${out.churn.gcPerWorldMs}ms/建（${out.churn.gcSharePct}%）  major=${out.churn.majorCount} minor=${out.churn.minorCount}`);

// C 持有并发：50×（forest_01 / forest_bonus_2）
out.held = {};
for (const levelId of ["forest_01", "forest_bonus_2"]) {
  gcEvents.length = 0;
  doGC();
  const heap0 = process.memoryUsage().heapUsed;
  r = buildN(levelId, 50, true);
  await flush();
  a = attribute(r.windows);
  const walls = a.per.map((p) => p.wallMs);
  const half = Math.floor(50 / 2);
  const firstHalf = med(a.per.slice(0, half).map((p) => p.wallMs));
  const secondHalf = med(a.per.slice(half).map((p) => p.wallMs));
  const totalGc = gcEvents.reduce((s, e) => s + e.dur, 0);
  out.held[levelId] = {
    n: 50,
    wallPerWorldMs: med(walls),
    firstHalfMs: firstHalf,
    secondHalfMs: secondHalf,
    inflation: +((secondHalf / firstHalf - 1) * 100).toFixed(0),
    gcPerWorldMs: +(a.per.reduce((s, p) => s + p.gcMs, 0) / a.per.length).toFixed(2),
    gcSharePct: +((a.per.reduce((s, p) => s + p.gcMs, 0) / a.per.reduce((s, p) => s + p.wallMs, 0)) * 100).toFixed(1),
    totalGcMs: +totalGc.toFixed(1),
    majorCount: gcEvents.filter((e) => e.kind === 4).length,
    minorCount: gcEvents.filter((e) => e.kind === 1).length,
    heapGrowthMB: MB(process.memoryUsage().heapUsed - heap0),
    outsideMs: a.outsideMs,
  };
  const h = out.held[levelId];
  log(`C 持有 ${levelId}×50: ${h.wallPerWorldMs}ms/建（前半 ${h.firstHalfMs} → 后半 ${h.secondHalfMs}，${h.inflation > 0 ? "+" : ""}${h.inflation}%）  GC ${h.gcPerWorldMs}ms/建（${h.gcSharePct}%）  major=${h.majorCount} minor=${h.minorCount}  堆增 ${h.heapGrowthMB}MB`);
  r.holdArr.length = 0;
  doGC();
}

if (argSave) {
  writeFileSync(
    join(RESULTS, `gc-${argSave}.json`),
    JSON.stringify({ meta: { git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(), steps: STEPS }, results: out }, null, 2),
  );
  log(`快照：results/gc-${argSave}.json`);
}
if (argCompare) {
  const p = join(RESULTS, `gc-${argCompare}.json`);
  if (!existsSync(p)) { log(`对比快照不存在: ${p}`); process.exit(1); }
  const prev = JSON.parse(readFileSync(p, "utf8")).results;
  console.log("\n[gc] 前后对比");
  console.log(`  冷跑墙钟/建: ${prev.churn.wallPerWorldMs} → ${out.churn.wallPerWorldMs}ms`);
  for (const k of Object.keys(out.held)) {
    const q = prev.held?.[k];
    if (q) console.log(`  持有 ${k} 墙钟/建: ${q.wallPerWorldMs} → ${out.held[k].wallPerWorldMs}ms  GC份额: ${q.gcSharePct}% → ${out.held[k].gcSharePct}%`);
  }
}

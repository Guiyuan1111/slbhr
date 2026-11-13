/**
 * r45 · 换关链基准（advance / retry 的 World 构建成本）。
 *
 * 为什么单独一件：`perf-r44.mjs` 的 build 面只测**单次** `new World(level)`，量不出
 * 「换关实际付了几次构建」。r45 修复前服务端 `advance` 是：
 *
 *     this.bundle = loadLevel(id);
 *     this.buildWorld();        // ← 按新关整建一次（新 b2World + 全机关 + 双角色）
 *     ...
 *     this.restartLevel();      // ← world.reset() 又整建一次
 *
 * 第一次建的 World 立刻被丢弃（旧关与新关的 b2World 都交 GC，vendor 无 DestroyWorld）。
 * 本件把这条链的三个口径分开量，避免把「单次构建」误当「换关成本」：
 *
 *   1. legacy  —— 修复前语义：new World(newLevel) + reset()（同一关构建两次）
 *   2. current —— 修复后语义：world.reset(newLevel)（构建一次）
 *   3. retry   —— 同关重开：world.reset()（两种语义下都是单次，作对照）
 *
 * 另外量 retry 路径的 `startFrozen` 语义一致性（r45 一并修复的复刻性缺陷：
 * 此前 reset() 不跑初始冻结，10 个含 55 型冰面砖的关 retry/换关后丢失冻结）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-switch.mjs [--save r45-switch] [--compare r45-switch]
 *   PERF_SWITCH_ROUNDS=15   每关交替轮次（默认 15）
 *   PERF_SWITCH_LEVELS=ice_02,crystal_04
 * 产物：benchmark/results/switch-<label>.json
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
const ROUNDS = Number(process.env.PERF_SWITCH_ROUNDS ?? 15);
const LEVEL_FILTER = process.env.PERF_SWITCH_LEVELS
  ? process.env.PERF_SWITCH_LEVELS.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

const IDLE = { up: false, left: false, right: false };
const INP = { fireboy: IDLE, watergirl: { up: false, left: false, right: false } };

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
}

function stats(a) {
  const s = [...a].sort((x, y) => x - y);
  return { med: median(a), min: s[0], max: s[s.length - 1], spread: s[s.length - 1] - s[0] };
}

/** 换关（修复前）：先按新关 new World，再 reset() —— 构建两次，第一次丢弃 */
function switchLegacy(cur, nextLevel) {
  const w = new World(nextLevel); // buildWorld() 等价
  w.reset(); // restartLevel() 等价
  return w;
}

/** 换关（修复后）：直接 reset(newLevel) —— 构建一次 */
function switchCurrent(cur, nextLevel) {
  cur.reset(nextLevel);
  return cur;
}

let ids = listLevelIds().sort();
if (LEVEL_FILTER) {
  const set = new Set(LEVEL_FILTER);
  ids = ids.filter((id) => set.has(id));
  if (ids.length === 0) throw new Error(`PERF_SWITCH_LEVELS=${LEVEL_FILTER.join(",")}: 无匹配关卡`);
}

console.log(
  `r45 换关链基准：${ids.length} 关 × ${ROUNDS} 轮（两臂交替），node ${process.version}`,
);

const rows = [];
for (const id of ids) {
  const nextLevel = loadLevel(id).level;
  // 每个世界都从「上一关」状态出发（换关的真实前提：已有一个跑过一段的世界）
  const base = loadLevel(ids[0] === id ? ids[Math.min(1, ids.length - 1)] : ids[0]).level;

  const legacy = [];
  const current = [];
  for (let r = 0; r < ROUNDS; r++) {
    // 交替：先 legacy 再 current，两臂同会话内相邻，消时段漂移
    const w1 = new World(base);
    for (let i = 0; i < 60; i++) w1.step(1 / 60, INP);
    const t0 = performance.now();
    switchLegacy(w1, nextLevel);
    legacy.push(performance.now() - t0);

    const w2 = new World(base);
    for (let i = 0; i < 60; i++) w2.step(1 / 60, INP);
    const t1 = performance.now();
    switchCurrent(w2, nextLevel);
    current.push(performance.now() - t1);
  }

  // retry（同关重开）单次构建参照
  const retry = [];
  for (let r = 0; r < ROUNDS; r++) {
    const w = new World(nextLevel);
    for (let i = 0; i < 60; i++) w.step(1 / 60, INP);
    const t = performance.now();
    w.reset();
    retry.push(performance.now() - t);
  }

  const L = stats(legacy);
  const C = stats(current);
  const R = stats(retry);
  const saved = L.med - C.med;
  rows.push({
    id,
    legacyMs: +L.med.toFixed(3),
    currentMs: +C.med.toFixed(3),
    retryMs: +R.med.toFixed(3),
    savedMs: +saved.toFixed(3),
    savedPct: L.med === 0 ? 0 : +((saved / L.med) * 100).toFixed(1),
    legacySpread: +L.spread.toFixed(3),
    currentSpread: +C.spread.toFixed(3),
  });
}

const sumLegacy = rows.reduce((a, r) => a + r.legacyMs, 0);
const sumCurrent = rows.reduce((a, r) => a + r.currentMs, 0);
const allLegacy = rows.map((r) => r.legacyMs);
const allCurrent = rows.map((r) => r.currentMs);

console.log("\n===== 逐关（中位，ms）=====");
console.log("关".padEnd(22) + "legacy".padStart(10) + "current".padStart(10) + "saved".padStart(10) + "Δ%".padStart(8));
const worst = [...rows].sort((a, b) => b.savedMs - a.savedMs).slice(0, 12);
for (const r of worst) {
  console.log(
    r.id.padEnd(22) +
      r.legacyMs.toFixed(3).padStart(10) +
      r.currentMs.toFixed(3).padStart(10) +
      r.savedMs.toFixed(3).padStart(10) +
      `${r.savedPct >= 0 ? "" : ""}${r.savedPct.toFixed(1)}%`.padStart(8),
  );
}

const avgL = sumLegacy / rows.length;
const avgC = sumCurrent / rows.length;
console.log(
  `\n全 ${rows.length} 关均值：legacy ${avgL.toFixed(3)}ms → current ${avgC.toFixed(3)}ms` +
    `（省 ${(avgL - avgC).toFixed(3)}ms，${(((avgL - avgC) / avgL) * 100).toFixed(1)}%）`,
);
console.log(
  `两臂散布：legacy ${stats(allLegacy).spread.toFixed(3)}ms / current ${stats(allCurrent).spread.toFixed(3)}ms` +
    `（设为噪声上界，逐关 Δ 小于散布的关不作单关结论）`,
);

// ---- startFrozen 语义一致性（r45 复刻性修复的回归断言）
const FROZEN_LEVELS = ["eice_1", "ice_02", "ice_04", "ice_04_1", "ice_07_1", "ice_12", "ice_14", "ice_31", "ice_35", "ice_35_1"];
const frozenChk = [];
for (const id of FROZEN_LEVELS) {
  let level;
  try {
    level = loadLevel(id).level;
  } catch {
    continue;
  }
  const fresh = new World(level);
  const afterReset = new World(level);
  afterReset.reset();
  const fmt = (w) => w.liquids.map((l) => (l.frozen ? "1" : "0")).join("");
  frozenChk.push({ id, fresh: fmt(fresh), afterReset: fmt(afterReset), match: fmt(fresh) === fmt(afterReset) });
}
const frozenOk = frozenChk.filter((r) => r.match).length;
console.log(`\nstartFrozen 语义一致性（构造 vs reset）：${frozenOk}/${frozenChk.length} 关一致`);
for (const r of frozenChk) {
  if (!r.match) console.log(`  ✗ ${r.id}: 构造 ${r.fresh} vs reset ${r.afterReset}`);
}

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    rounds: ROUNDS,
    levels: rows.length,
    node: process.version,
  },
  overall: {
    avgLegacyMs: +avgL.toFixed(3),
    avgCurrentMs: +avgC.toFixed(3),
    avgSavedMs: +(avgL - avgC).toFixed(3),
    avgSavedPct: +(((avgL - avgC) / avgL) * 100).toFixed(1),
    legacySpread: +stats(allLegacy).spread.toFixed(3),
    currentSpread: +stats(allCurrent).spread.toFixed(3),
  },
  frozen: { total: frozenChk.length, ok: frozenOk, rows: frozenChk },
  rows,
};

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `switch-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`\n已存档 switch-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `switch-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  console.log(
    `全库均值 legacy：${base.overall.avgLegacyMs.toFixed(3)} → ${payload.overall.avgLegacyMs.toFixed(3)}ms`,
  );
  console.log(
    `全库均值 current：${base.overall.avgCurrentMs.toFixed(3)} → ${payload.overall.avgCurrentMs.toFixed(3)}ms`,
  );
  console.log(
    `全库均值节省：${base.overall.avgSavedMs.toFixed(3)} → ${payload.overall.avgSavedMs.toFixed(3)}ms`,
  );
}
if (frozenOk !== frozenChk.length) process.exitCode = 1;

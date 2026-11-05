/**
 * 「关节卡限位 → 整岛永不入睡」量具（r48 新增）。
 *
 * 背景：box2d 的 `b2Island.Solve` 睡眠判定（vendor @6087-6097）要求**两个**条件同时成立：
 *   (a) 岛内每个动态体的 `m_sleepTime >= b2_timeToSleep`（速度低于容差持续 0.5s）；
 *   (b) 位置约束全部收敛（`SolvePositionConstraints()` 返回真且各关节都返回真）。
 * 被电机压在限位上的平台、以及互相挤压的紧贴平台，位置约束每步都报「不收敛」——
 * 于是 (b) 永远为假，整座岛永不入睡，哪怕它的位形已经 3000 步逐位不变。
 *
 * 后果不是物理错误（位形确实不动），而是**每步白算**：这些体每帧仍被塞进 island、
 * 跑 8 次速度迭代 + 3 次位置迭代。
 *
 * 本量具回答三个问题：
 *  1. 全库有多少关存在这种「静止但不睡」的体（`awakeStuck`）；
 *  2. 这些关的**静止态**步进耗时里有多少是可回收的（`forceSleep` 上界）；
 *  3. 轻输入（保持 phase=playing）下同一份额是多少——即玩家挂机时的真实收益面。
 *
 * ⚠ 口径坑（首版踩过）：
 *  - 用脚本输入跑几百步后某些关会 `gameover`，此时 `World.step` 首行就 return，
 *    测出 0.0µs 的假数据。必须断言 `phase === "playing"` 才采信。
 *  - `forceSleep` 只作**上界**参考（人为每步强制入睡），不是可交付行为。
 *
 * 用法：
 *   node --import tsx benchmark/perf-sleep.mjs                        # 全库扫描
 *   LEVELS=forest_bonus_2,fairies-30 node --import tsx benchmark/perf-sleep.mjs
 *   node --import tsx benchmark/perf-sleep.mjs --save r48-base
 *
 * 环境变量：LEVELS（逗号分隔，缺省=全库）、IDLE_STEPS（缺省 900）、MEASURE_STEPS（缺省 500）、
 *          ROUNDS（每臂轮数，缺省 5）。
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLevel } from "../packages/server/src/levels.js";
import { listLevelIds } from "../packages/server/src/levels.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IDLE_STEPS = Number(process.env.IDLE_STEPS ?? 900);
const MEASURE_STEPS = Number(process.env.MEASURE_STEPS ?? 500);
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;

const NO_INPUT = { left: false, right: false, jump: false };
/** 轻输入：只在跳跃相位轻按，尽量不踩液/踩刺，保住 phase=playing */
const light = (t) => ({ left: false, right: false, jump: t % 240 < 6 });
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const ids = process.env.LEVELS
  ? process.env.LEVELS.split(",").map((s) => s.trim()).filter(Boolean)
  : listLevelIds();

/** 静止但不睡的体：醒着、且 m_sleepTime 已越过 box2d 自己的入睡阈值 */
function countStuckSleepers(w, B) {
  let dyn = 0, awake = 0, stuck = 0;
  for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
    if (b.GetType() !== B.b2BodyType.b2_dynamicBody) continue;
    dyn++;
    if (!b.IsAwake()) continue;
    awake++;
    if (b.m_sleepTime >= B.b2_timeToSleep) stuck++;
  }
  return { dyn, awake, stuck };
}

/** 每步强制让「速度为零且已静坐 >1s」的体入睡（仅作上界参考） */
function forceSleepStill(w, B) {
  for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
    if (b.GetType() !== B.b2BodyType.b2_dynamicBody) continue;
    if (!b.IsAwake()) continue;
    const v = b.GetLinearVelocity();
    if (v.x === 0 && v.y === 0 && b.m_sleepTime > 1) b.SetAwake(false);
  }
}

function measure(level, patch) {
  const w = new World(level);
  const B = w.B;
  const mk = (i) => ({ fireboy: light(i), watergirl: light(i + 120) });
  for (let i = 0; i < IDLE_STEPS; i++) w.step(1 / 60, mk(i));
  if (w.phase !== "playing") return null;
  const runs = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < MEASURE_STEPS; i++) {
      w.step(1 / 60, mk(i));
      if (patch) forceSleepStill(w, B);
    }
    runs.push(((performance.now() - t0) / MEASURE_STEPS) * 1000);
    // 防 JIT 把循环整段消掉（写回角色位置，纯读不副作用）
    if (globalThis.__fwSink === undefined) globalThis.__fwSink = 0;
    globalThis.__fwSink += w.chars.fireboy.body.GetPosition().x;
  }
  return w.phase === "playing" ? { med: med(runs), min: Math.min(...runs), max: Math.max(...runs) } : null;
}

/**
 * 配对 A/B：两臂**交替**跑（A,B,A,B,…），最后比臂内区间是否分离。
 *
 * ⚠ 为什么不各跑一次就下结论：首版单轮对比在 `forest_bonus_2` 上得出过 +2.1%，同关重跑
 * 又能到 −1.4%——单轮差额完全淹没在臂内散布里。只有「两臂区间不重叠」才允许给结论，
 * 这是本战役自 r44 起的一贯纪律。
 */
function pairedAB(level) {
  const A = [], B = [];
  for (let r = 0; r < ROUNDS; r++) {
    const a = measureOnce(level, false);
    const b = measureOnce(level, true);
    if (a !== null) A.push(a);
    if (b !== null) B.push(b);
  }
  if (A.length < 3 || B.length < 3) return null;
  A.sort((x, y) => x - y);
  B.sort((x, y) => x - y);
  const overlap = !(B[0] > A[A.length - 1] || A[0] > B[B.length - 1]);
  return {
    aMed: +med(A).toFixed(2), aMin: +A[0].toFixed(2), aMax: +A[A.length - 1].toFixed(2),
    bMed: +med(B).toFixed(2), bMin: +B[0].toFixed(2), bMax: +B[B.length - 1].toFixed(2),
    pct: +(((med(B) - med(A)) / med(A)) * 100).toFixed(1),
    separable: !overlap,
  };
}

/** 单轮：新 World → 预热 → 连续测 MEASURE_STEPS 步（配对 A/B 用，臂间独立实例） */
function measureOnce(level, patch) {
  const w = new World(level);
  const B = w.B;
  const mk = (i) => ({ fireboy: light(i), watergirl: light(i + 120) });
  for (let i = 0; i < IDLE_STEPS; i++) w.step(1 / 60, mk(i));
  if (w.phase !== "playing") return null;
  const t0 = performance.now();
  for (let i = 0; i < MEASURE_STEPS; i++) {
    w.step(1 / 60, mk(i));
    if (patch) forceSleepStill(w, B);
  }
  const us = ((performance.now() - t0) / MEASURE_STEPS) * 1000;
  if (globalThis.__fwSink === undefined) globalThis.__fwSink = 0;
  globalThis.__fwSink += w.chars.fireboy.body.GetPosition().x;
  return w.phase === "playing" ? us : null;
}

const rows = [];
for (const id of ids) {
  let level;
  try {
    level = loadLevel(id).level;
  } catch {
    continue;
  }
  // —— 静态扫描：静止 IDLE_STEPS 步后有多少「该睡没睡」的体 ——
  const probe = new World(level);
  for (let i = 0; i < IDLE_STEPS; i++) probe.step(1 / 60, { fireboy: NO_INPUT, watergirl: NO_INPUT });
  const s = countStuckSleepers(probe, probe.B);

  const ab = pairedAB(level);
  rows.push({ id, ...s, ab });
}

const valid = rows.filter((r) => r.ab !== null);
const stuckRows = rows.filter((r) => r.stuck > 0);

console.log(`\n扫描 ${rows.length} 关（静止 ${IDLE_STEPS} 步后计数；配对 A/B ${ROUNDS} 轮 × ${MEASURE_STEPS} 步）`);
console.log(`存在「该睡没睡」体的关：${stuckRows.length} / ${rows.length}`);
console.log(`可比较耗时的关：${valid.length} 关（其余在测量窗口内 gameover）\n`);
console.log("口径：B 臂 = 每步强制让「速度为零且已静坐 >1s」的体入睡，仅作**上界**参考，不是可交付行为。");
console.log("只有「区间分离」才是可主张的；重叠即带内，不给结论。\n");

if (stuckRows.length) {
  console.log("—— 有卡睡体的关 ——");
  console.log("  关卡              该睡没睡/醒着/动态   A 中位 [区间]              B 中位 [区间]               Δ     判定");
  for (const r of [...stuckRows].sort((a, b) => b.stuck - a.stuck)) {
    const a = r.ab;
    if (!a) {
      console.log(`  ${r.id.padEnd(18)} ${String(r.stuck).padStart(6)} /${String(r.awake).padStart(4)} /${String(r.dyn).padStart(4)}   (不可比)`);
      continue;
    }
    console.log(
      `  ${r.id.padEnd(18)} ${String(r.stuck).padStart(6)} /${String(r.awake).padStart(4)} /${String(r.dyn).padStart(4)}` +
        `   ${String(a.aMed).padStart(7)} [${a.aMin}–${a.aMax}]`.padEnd(26) +
        ` ${String(a.bMed).padStart(7)} [${a.bMin}–${a.bMax}]`.padEnd(26) +
        ` ${String(a.pct).padStart(6)}%  ${a.separable ? "区间分离" : "带内"}`,
    );
  }
}

const stuckSep = valid.filter((r) => r.stuck > 0 && r.ab.separable);
if (stuckSep.length) {
  const avg = stuckSep.reduce((a, r) => a + r.ab.pct, 0) / stuckSep.length;
  console.log(`\n有卡睡体且区间分离的 ${stuckSep.length} 关：平均 ${avg.toFixed(1)}%（负值=强制入睡更快）`);
} else {
  console.log("\n有卡睡体的关里：没有一关达到区间分离 → 该维度不可主张。");
}

const cleanValid = valid.filter((r) => r.stuck === 0);
if (cleanValid.length) {
  const avg = cleanValid.reduce((a, r) => a + r.ab.pct, 0) / cleanValid.length;
  const sep = cleanValid.filter((r) => r.ab.separable).length;
  console.log(`无卡睡体对照（${cleanValid.length} 关）：平均 Δ ${avg.toFixed(1)}%，其中区间分离 ${sep} 关 —— 应接近 0；偏离量级就是本量具的噪声底。`);
}

if (argSave) {
  const out = join(ROOT, "benchmark", "results", `sleep-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), idleSteps: IDLE_STEPS, measureSteps: MEASURE_STEPS, rounds: ROUNDS, rows }, null, 1));
  console.log(`\n快照已存 ${out}`);
}

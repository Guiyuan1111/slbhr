/**
 * GameScene 逐帧分配消除的 A/B（r50 新增）。
 *
 * ## 为什么需要
 * r50 的 `perf-update.mjs` 打出 `GameScene.update` 分段：`updateMechs` 54%、
 * `updatePlatformSound` 17%。逐段读码后发现**两处逐帧对象分配**（都从未被覆盖）：
 *
 *   1. `stepPlatSnd` —— 每帧每个平台新建 `{x, y, angle}` 字面量。
 *      `forest_bonus_2` 47 平台 × ~60fps = **2820 对象/秒**。
 *   2. `updatePortals` —— 每帧新建一个捕获 `anyOpen` 的 `forEach` 闭包。
 *
 * 这是 r47 在服务端 `character.update` 修过的同类问题，客户端这一侧从未覆盖。
 *
 * ## 口径：为什么不用堆差，也不用 `perf-client` 的分配速率
 * **堆差测不出来。** 首版用 `--expose-gc` + `heapUsed` 前后差，实测两臂几乎相同
 * （2,034,416 vs 2,034,560 字节）——V8 把短命对象分配在 new space，回收后堆差归零。
 * 这与 r47 记录过的「typed array 大块对采样器失明」是同一类坑：**堆口径对短命对象失明**。
 *
 * `perf-client` 的分配速率也不适用：r47 已量到客户端逐帧分配 **86.8% 在 Phaser 内部**
 * （`batchSprite` 61.3%），两处小对象的量级会被完全淹没。
 *
 * **本件用对象实例身份计数**：把 `update` 桩收到的每个 `pose` 塞进 `Set`，`Set.size`
 * 就是**不同对象实例数**。这是**确定性**的，不依赖统计判据：
 *   A 臂 28200 次 update → 28200 个实例
 *   B 臂 28200 次 update → 1 个实例（复用）
 *
 * ## 两臂
 *  A = 改造前（每帧新建对象/闭包）
 *  B = 改造后（scratch 复用 / 绑定回调）
 * 耗时用同进程交替 N 轮，看区间是否分离（但这是次要指标——分配才是本件的主指标）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-update-alloc.mjs
 *   ROUNDS=9 PLATFORMS=47 node --import tsx benchmark/perf-update-alloc.mjs --save r50-alloc
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const ROUNDS = Number(process.env.ROUNDS ?? 9);
const PLATFORMS = Number(process.env.PLATFORMS ?? 47); // forest_bonus_2 实测平台数
const FRAMES = Number(process.env.FRAMES ?? 600);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * 两臂的 `stepPlatSnd` 等价实现。
 *
 * A 臂逐字复刻改造前的 `GameScene.stepPlatSnd`：
 *   `this.platformSounds.update(id, { x: ..., y: ..., angle: ... })`
 * B 臂是改造后的 scratch 版本。
 *
 * 两者都调用同一个 `update` 桩——它模拟 `PlatformSoundTracker.update` 的真实读法
 * （只读 x/y/angle，不持有引用；见 `platformSound.ts:44`）。
 */
function makeHost() {
  const store = new Map();
  const seen = new Set();
  return {
    update(id, pose) {
      seen.add(pose);                    // 实例身份计数（本件主指标）
      store.set(id, [pose.x, pose.y, pose.angle]);
    },
    store,
    distinctPoses: () => seen.size,
  };
}

/** A 臂：每帧每平台新建对象字面量 */
function runArmA(host, ids, poses, frames) {
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < ids.length; i++) {
      const b = poses[f % poses.length];
      host.update(ids[i], { x: b.x, y: b.y, angle: b.angle });
    }
  }
}

/** B 臂：实例级 scratch 复用 */
function runArmB(host, ids, poses, frames) {
  const scratch = { x: 0, y: 0, angle: 0 };
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < ids.length; i++) {
      const b = poses[f % poses.length];
      scratch.x = b.x;
      scratch.y = b.y;
      scratch.angle = b.angle;
      host.update(ids[i], scratch);
    }
  }
}

const ids = Array.from({ length: PLATFORMS }, (_, i) => `p${i}`);
const poses = Array.from({ length: 60 }, (_, i) => ({ x: i * 0.5, y: i * 0.25, angle: i * 0.01 }));
const calls = PLATFORMS * FRAMES;

console.log(`\nGameScene 逐帧分配 A/B（${PLATFORMS} 平台 × ${FRAMES} 帧 = ${calls} 次 update）`);

const instA = [], instB = [], timeA = [], timeB = [];

for (let r = 0; r < ROUNDS; r++) {
  const hostA = makeHost();
  const hostB = makeHost();

  // 主指标：不同对象实例数（确定性）
  runArmA(hostA, ids, poses, FRAMES);
  runArmB(hostB, ids, poses, FRAMES);
  instA.push(hostA.distinctPoses());
  instB.push(hostB.distinctPoses());

  // 语义等价：两臂写入的结果必须完全一致
  let diff = -1;
  for (const [k, v] of hostA.store) {
    const w = hostB.store.get(k);
    if (!w || w[0] !== v[0] || w[1] !== v[1] || w[2] !== v[2]) { diff = k; break; }
  }
  if (diff !== -1) { console.error(`  ✗ 语义不一致 @${diff}`); process.exit(1); }

  // 次要指标：耗时（交替，避免单侧先热）
  let t0 = performance.now();
  runArmA(makeHost(), ids, poses, FRAMES);
  timeA.push(performance.now() - t0);
  t0 = performance.now();
  runArmB(makeHost(), ids, poses, FRAMES);
  timeB.push(performance.now() - t0);
}

const sA = [...timeA].sort((x, y) => x - y), sB = [...timeB].sort((x, y) => x - y);

console.log(`\n  主指标 · 不同位姿对象实例数（确定性，非统计）：`);
console.log(`    A 每轮 ${med(instA)}   （预期 ${calls}）`);
console.log(`    B 每轮 ${med(instB)}   （预期 1）`);
const savedPct = ((med(instA) - med(instB)) / med(instA)) * 100;
console.log(`    → 每次 update 少建 ${((med(instA) - med(instB)) / calls).toFixed(4)} 个对象，减少 ${savedPct.toFixed(2)}%`);
if (med(instA) !== calls || med(instB) !== 1) {
  console.error(`  ✗ 实例数与预期不符——改造可能未生效`);
  process.exit(1);
}

console.log(`\n  次要指标 · 耗时（${ROUNDS} 轮交替）：`);
console.log(`    A 中位 ${med(timeA).toFixed(2)} ms  区间 [${sA[0].toFixed(2)}–${sA[sA.length - 1].toFixed(2)}]`);
console.log(`    B 中位 ${med(timeB).toFixed(2)} ms  区间 [${sB[0].toFixed(2)}–${sB[sB.length - 1].toFixed(2)}]`);

const sep = sB[0] > sA[sA.length - 1] || sA[0] > sB[sB.length - 1];
const pct = ((med(timeB) - med(timeA)) / med(timeA)) * 100;
console.log(`    Δ ${pct.toFixed(1)}%  ${sep ? "区间分离 → 可主张" : "带内 → 不主张（耗时口径）"}`);

const summary = {
  platforms: PLATFORMS, frames: FRAMES, rounds: ROUNDS, calls,
  instA: med(instA), instB: med(instB),
  expectedInstA: calls, expectedInstB: 1,
  savedPct: +savedPct.toFixed(2),
  timeA: { med: +med(timeA).toFixed(3), min: +sA[0].toFixed(3), max: +sA[sA.length - 1].toFixed(3) },
  timeB: { med: +med(timeB).toFixed(3), min: +sB[0].toFixed(3), max: +sB[sB.length - 1].toFixed(3) },
  pct: +pct.toFixed(1), separable: sep,
};

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `update-alloc-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), summary }, null, 1));
  console.log(`\n快照已存 ${out}`);
}
if (process.argv.includes("--compare")) {
  const tag = process.argv[process.argv.indexOf("--compare") + 1];
  const f = join(RESULTS, `update-alloc-${tag}.json`);
  if (existsSync(f)) {
    const base = JSON.parse(readFileSync(f, "utf8")).summary;
    console.log(`\n对比 ${tag}：`);
    console.log(`  实例数 A ${base.instA} → ${summary.instA}，B ${base.instB} → ${summary.instB}`);
    console.log(`  耗时   A ${base.timeA.med} → ${summary.timeA.med} ms，B ${base.timeB.med} → ${summary.timeB.med} ms`);
  }
}


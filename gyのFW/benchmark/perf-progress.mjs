/**
 * 选关菜单进度读取成本（r48 新增）。
 *
 * ## 为什么单独立件
 * 前几轮把客户端量在「换关链」（r45 构建 / r46 幕+fetch）与「逐帧帧预算」（r3/r44）上，
 * **选关菜单入场**这一段从未被量过。而 `progress.ts` 的 `starsOf(filename)` 实现是
 * `loadProgress()[filename]?.stars ?? 0` —— `loadProgress()` 每次调用都做一次
 * `localStorage.getItem` + **全量 `JSON.parse`**。
 *
 * 菜单入场时 `starsOf` 的调用次数是 O(关卡数)，且同一个文件会被反复问：
 *  - tree 模式（forest/light/ice/crystal，L=39–53）：done 扫描 L 次 + 节点循环 L 次 +
 *    烘焙 `stateOf`（edges×2 + levels，缓存键再 L 次）+ 平色回退扫描 L 次；
 *  - multi 模式（elements 7 庙 39 关）：computeLearnedElements L 次 + 每庙
 *    completedCountOf L 次 + rowsLevelState 循环 L 次 + 每庙 templeHasNew（内含
 *    rowsLevelState 再 L 次 + completedCountOf L 次）。
 *
 * ## 口径
 * 纯 node 微基准（`JSON.parse` 是引擎原生实现，node 与浏览器同源；localStorage 用内存桩）。
 * 两臂在**同一进程内交替**测量，消除进程间 JIT/频率差异：
 *  - A「每次 parse」= 当前实现；
 *  - B「按原文串记忆」= 候选实现（getItem 后与缓存的原文串比对，相同则复用上次的解析结果）。
 *
 * B 的正确性前提：`localStorage` 只在本文串变化时才有不同内容——因此每次仍读原文串
 * （`getItem` 成本比 `parse` 低一个数量级），串相同即复用对象，语义与重新 parse 等价。
 *
 * 用法：
 *   node --import tsx benchmark/perf-progress.mjs
 *   N=332 ENTRIES=252 ROUNDS=9 node --import tsx benchmark/perf-progress.mjs
 *
 * 环境变量：N（每次入场的 starsOf 调用数，缺省 332）、ENTRIES（存档条目数，缺省 252）、
 *          ROUNDS（每臂轮数，缺省 9）。
 */
const N = Number(process.env.N ?? 332);
const ENTRIES = Number(process.env.ENTRIES ?? 252);
const ROUNDS = Number(process.env.ROUNDS ?? 9);

/** 构造与线上同构的存档：[filename] = { stars, time }（progress.ts 的 LevelBest） */
function makeStore(n) {
  const o = {};
  const temples = ["tutorials", "light", "ice", "crystal", "fire", "water", "wind"];
  for (let i = 0; i < n; i++) {
    const t = temples[i % temples.length];
    o[`${t}/levels/${t}_${String(i).padStart(2, "0")}.json`] = { stars: (i % 3) + 1, time: 60 + i };
  }
  return o;
}
const STORE = makeStore(ENTRIES);
const RAW = JSON.stringify(STORE);
const KEYS = Object.keys(STORE);
/** 菜单入场问到的那批文件名（按真实调用形态：同一批 key 反复问） */
const ASK = Array.from({ length: N }, (_, i) => KEYS[i % KEYS.length]);

/** localStorage 内存桩（与线上接口同形） */
globalThis.localStorage = {
  getItem: (k) => (k === "fw-temple-progress-v1" ? RAW : null),
  setItem: () => {},
  removeItem: () => {},
};

// —— A 臂：当前实现（每次全量 parse）——
const loadProgressUncached = () => JSON.parse(localStorage.getItem("fw-temple-progress-v1") ?? "{}") ?? {};
const starsOfA = (f) => loadProgressUncached()[f]?.stars ?? 0;

// —— B 臂：按原文串记忆 ——
let memoRaw = null;
let memoObj = {};
const loadProgressMemo = () => {
  const raw = localStorage.getItem("fw-temple-progress-v1") ?? "{}";
  if (raw !== memoRaw) {
    memoRaw = raw;
    try {
      memoObj = JSON.parse(raw) ?? {};
    } catch {
      memoObj = {};
    }
  }
  return memoObj;
};
const starsOfB = (f) => loadProgressMemo()[f]?.stars ?? 0;

const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

const A = [], B = [];
let sink = 0;
for (let r = 0; r < ROUNDS; r++) {
  // 交替：A,B,A,B…（同进程，同 JIT 状态）
  let t0 = performance.now();
  for (const f of ASK) sink += starsOfA(f);
  A.push(((performance.now() - t0) * 1000) / 1); // µs/入场

  t0 = performance.now();
  for (const f of ASK) sink += starsOfB(f);
  B.push(((performance.now() - t0) * 1000) / 1);
}

A.sort((x, y) => x - y);
B.sort((x, y) => x - y);
const aMed = med(A), bMed = med(B);
const overlap = !(B[0] > A[A.length - 1] || A[0] > B[B.length - 1]);

console.log(`\n选关菜单进度读取：每次入场 ${N} 次 starsOf，存档 ${ENTRIES} 条（${RAW.length} B），各 ${ROUNDS} 轮`);
console.log(`  A 每次 parse     中位 ${aMed.toFixed(1)} µs  [${A[0].toFixed(1)}–${A[A.length - 1].toFixed(1)}]`);
console.log(`  B 按原文串记忆   中位 ${bMed.toFixed(1)} µs  [${B[0].toFixed(1)}–${B[B.length - 1].toFixed(1)}]`);
console.log(`  Δ ${(((bMed - aMed) / aMed) * 100).toFixed(1)}%   ${overlap ? "区间重叠→不可主张" : "区间分离→可主张"}`);
console.log(`  （校验和 ${sink}，防循环被优化掉）\n`);

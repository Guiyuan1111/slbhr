/**
 * 服务端每步分配归因基准（r47 新增）。
 *
 * 为什么需要它：r44 的 `perf-r44` 只给每关一个 `allocBPerStep` 标量（GC 前后堆差法），
 * 既没有函数级归因，也不具 percent 级分辨力（同代码两跑在 241 关口径下 216 关数值不同，
 * 见 benchmark/README 的已知局限）。要判断「哪段自有代码在每步制造垃圾」，需要采样归因。
 *
 * 两种口径：
 *  1. **净堆增量**（默认）：GC ×2 后跑 N 步，`(heapUsed₁−heapUsed₀)/N`。
 *     噪声大（受 scavenge 时机影响，同代码两跑可差 2 倍），只作量级参考。
 *  2. **采样归因**（`PROF_MODE=1`）：`node:inspector` 的 HeapProfiler.startSampling，
 *     **只在步进窗口内采样**（起跑前 startSampling、跑完 stopSampling），按
 *     `callFrame.functionName + url` 聚合 selfSize。这是判定分配归属的可靠口径——
 *     实测两组区间完全不重叠时才算数。
 *
 * ⚠ 不要把整进程 profile 直接拿来归因：启动期 module loader / tsx 转译会淹没一切
 *   （首版实测 compileForInternalLoader 占 20.9%，与步进毫无关系）。
 *
 * 用法：
 *   node --expose-gc --import tsx benchmark/perf-server-alloc.mjs
 *   LEVELS=crystal_20 STEPS=1200 WARM=600 PROF_MODE=1 node --expose-gc --import tsx benchmark/perf-server-alloc.mjs
 *   STEPS=1200 WARM=400 node --expose-gc --max-semi-space-size=1 --import tsx benchmark/perf-server-alloc.mjs
 *
 * 环境变量：LEVELS（逗号分隔，默认四个最重关）、STEPS（默认 1500）、WARM（默认 400）、
 *          PROF_MODE=1 开采样归因。
 */
import { loadLevel } from "../packages/server/src/levels.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ids = (process.env.LEVELS ?? "crystal_20,light_23,crystal_03,fairies-20").split(",").map((s) => s.trim()).filter(Boolean);
const STEPS = Number(process.env.STEPS ?? 1500);
const WARM = Number(process.env.WARM ?? 400);
const PROF = process.env.PROF_MODE === "1";
const scr = (t) => ({ left: t % 120 < 40, right: t % 120 >= 60, jump: t % 90 < 10 });
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

for (const id of ids) {
  const L = loadLevel(id).level;
  const w = new World(L);
  for (let i = 0; i < WARM; i++) w.step(1 / 60, { fireboy: scr(i), watergirl: scr(i + 50) });

  if (!PROF) {
    global.gc(); global.gc();
    const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < STEPS; i++) w.step(1 / 60, { fireboy: scr(i), watergirl: scr(i + 50) });
    const h1 = process.memoryUsage().heapUsed;
    console.log(`${id.padEnd(14)} ${((h1 - h0) / STEPS).toFixed(1).padStart(7)} B/step  (净堆，${STEPS} 步)`);
    continue;
  }

  // 采样归因：只覆盖步进窗口
  const inspector = await import("node:inspector");
  const session = new inspector.Session();
  session.connect();
  const post = (m, p) => new Promise((res, rej) => session.post(m, p ?? {}, (e, r) => (e ? rej(e) : res(r))));
  await post("HeapProfiler.enable");
  await post("HeapProfiler.startSampling", {
    samplingInterval: 512,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  for (let i = 0; i < STEPS; i++) w.step(1 / 60, { fireboy: scr(i), watergirl: scr(i + 50) });
  const { profile } = await post("HeapProfiler.stopSampling");
  session.disconnect();

  const agg = new Map();
  let total = 0;
  const walk = (n) => {
    const cf = n.callFrame;
    let url = cf.url || "";
    try { url = decodeURIComponent(url); } catch { /* 保持原样 */ }
    url = url.replace(/^file:\/\/\/.+?\/gyのFW\//, "");
    const key = `${cf.functionName || "(anon)"} @ ${url}:${cf.lineNumber + 1}`;
    const sz = n.selfSize || 0;
    if (sz > 0) { agg.set(key, (agg.get(key) ?? 0) + sz); total += sz; }
    for (const c of n.children ?? []) walk(c);
  };
  walk(profile.head);

  console.log(`\n== ${id}  采样 ${(total / 1024).toFixed(0)} KiB / ${STEPS} 步 = ${(total / STEPS).toFixed(1)} B/step ==`);
  for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`   ${(v / 1024).toFixed(1).padStart(8)} KiB ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
  }
}

void med;

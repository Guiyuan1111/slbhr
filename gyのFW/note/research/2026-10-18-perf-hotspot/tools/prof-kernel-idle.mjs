/**
 * [hotspot 槽] 内核空载步进剖析驱动（产品代码零改动）。
 * makeWorld(forest_12) 等价 = new World(loadLevel("forest_12").level)，EMPTY_INPUT 步进 N 次。
 *
 * 用法：
 *   node --import tsx TEMP/hotspot/prof-kernel-idle.mjs                       # 纯计时
 *   HS_STEPS=20000 HS_LEVEL=forest_12 node --import tsx ...                   # 覆盖
 *   HS_ALLOC=1 node --import tsx --expose-gc TEMP/hotspot/prof-kernel-idle.mjs # 每步分配差分
 */
import { performance } from "node:perf_hooks";
import { loadLevel } from "../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";

const LEVEL = process.env.HS_LEVEL ?? "forest_12";
const STEPS = Number(process.env.HS_STEPS ?? 20000);
const WARMUP = Number(process.env.HS_WARMUP ?? 500);
const ALLOC = process.env.HS_ALLOC === "1";

const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };

const w = new World(loadLevel(LEVEL).level);
let phaseLeft = STEPS;
for (let i = 0; i < WARMUP; i++) {
  w.step(1 / 60, inputs);
  if (w.phase !== "playing") { console.error(`warmup 内 phase=${w.phase}（spawn 不安全），换关`); process.exit(2); }
}

let allocBytesPerStep = NaN;
if (ALLOC && global.gc) {
  const K = 200;
  global.gc(); global.gc();
  let prev = process.memoryUsage().heapUsed;
  for (let i = 0; i < K; i++) w.step(1 / 60, inputs);
  allocBytesPerStep = (process.memoryUsage().heapUsed - prev) / K;
  prev = process.memoryUsage().heapUsed;
  for (let i = 0; i < K; i++) w.step(1 / 60, inputs);
  allocBytesPerStep = (allocBytesPerStep + (process.memoryUsage().heapUsed - prev) / K) / 2;
  global.gc();
}

const t0 = performance.now();
let guard = 0;
for (let i = 0; i < STEPS; i++) {
  w.step(1 / 60, inputs);
  if (w.phase !== "playing") { guard = i; break; }
}
const dtMs = performance.now() - t0;
phaseLeft = guard > 0 ? guard : STEPS;

console.log(JSON.stringify({
  driver: "kernel-idle", level: LEVEL, steps: phaseLeft,
  totalMs: +dtMs.toFixed(1), usPerStep: +((dtMs * 1000) / phaseLeft).toFixed(2),
  allocHeapBytesPerStep: Number.isFinite(allocBytesPerStep) ? Math.round(allocBytesPerStep) : null,
  earlyExit: guard > 0 ? w.phase : null,
}));

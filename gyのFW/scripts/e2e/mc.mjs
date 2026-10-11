/**
 * 路线鲁棒性门禁（内核蒙塔卡洛抖动仿真）——真服务端门禁前的预测性验收。
 *
 * 背景（2026-10-11 forest_06_1 实测）：真实服务端 CDP 派发每事件 0-5ms 抖动
 * （OFFSET=-10 的 10ms 吸收余量内不翻帧）+ ~1/315 概率 40ms 离群（≈+2.4f 迟到）。
 * 连锁 tap 相位链会被单个离群雪崩打碎（旧路线 MC 78%），自愈结构（长按进墙、
 * 定点跳）可达 98%+。MC 通过率 ≈ 真服务端单轮通过率；门禁 3/3 要求 MC ≥98%。
 *
 * 用法：
 *   PATH="$PWD/TEMP/node:$PATH" node --import tsx scripts/e2e/mc.mjs --level forest_06_1 [--trials 150] [--seed 42]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "./routetool/kernel.mjs";

const args = process.argv.slice(2);
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const LEVEL = argOf(args, "level", "forest_01");
const N = Number(argOf(args, "trials", "150"));
const SEED = Number(argOf(args, "seed", "42"));

// 确定性伪随机（可复现）
let s = SEED >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;   // 漂移边界翻转
  if (r < 0.026) return 2;  // 40ms 离群（实测 1/315）
  if (r < 0.028) return 3;  // 更大离群（保守）
  return 0;
}

const doc = JSON.parse(readFileSync(join("scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
const jitter = (arr) => arr
  .map(e => { const d = slip(); return d ? { ...e, f: e.f + d } : e; })
  .sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

let wins = 0;
const fails = [];
for (let i = 0; i < N; i++) {
  const res = runKernel(LEVEL, { ...doc, fb: jitter(doc.fb), wg: jitter(doc.wg) }, {});
  if (res.won) wins++;
  else fails.push({ i, ...res });
}
const rate = (100 * wins / N).toFixed(1);
console.log(`${LEVEL} MC: ${wins}/${N} (${rate}%) seed=${SEED} 判据: ≥98%`);
if (fails.length) console.log("fails:", JSON.stringify(fails.slice(0, 10)));
process.exitCode = wins / N >= 0.98 ? 0 : 1;

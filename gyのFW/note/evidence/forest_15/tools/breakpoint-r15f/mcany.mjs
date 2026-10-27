// r15f: mc.mjs 的任意路径变体——MC 逻辑与 scripts/e2e/mc.mjs 逐行同构
// （slip/jitter/seed 序列完全一致，数字与库内 mc.mjs 直接可比），
// 仅把路线来源从固定库路径改为 --route 参数，便于在替换库文件前评测候选。
// 用法: PATH="$PWD/TEMP/node:$PATH" node --import tsx TEMP/r15f/mcany.mjs --route <path> [--trials 150] [--seed 42]
import { readFileSync } from "node:fs";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const args = process.argv.slice(2);
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const ROUTE = argOf(args, "route", "");
const N = Number(argOf(args, "trials", "150"));
const SEED = Number(argOf(args, "seed", "42"));

let s = SEED >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;   // 漂移边界翻转
  if (r < 0.026) return 2;  // 40ms 离群（实测 1/315）
  if (r < 0.028) return 3;  // 更大离群（保守）
  return 0;
}

const doc = JSON.parse(readFileSync(ROUTE, "utf8"));
const jitter = (arr) => arr
  .map(e => { const d = slip(); return d ? { ...e, f: e.f + d } : e; })
  .sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

let wins = 0;
const fails = [];
for (let i = 0; i < N; i++) {
  const res = runKernel(doc.level, { ...doc, fb: jitter(doc.fb), wg: jitter(doc.wg) }, {});
  if (res.won) wins++;
  else fails.push({ i, won: res.won, deathF: res.deathF });
}
const rate = (100 * wins / N).toFixed(1);
console.log(`${doc.level} MC[${ROUTE.split("/").pop()}]: ${wins}/${N} (${rate}%) seed=${SEED} 判据: ≥98%`);
if (fails.length) console.log("fails:", JSON.stringify(fails.slice(0, 10)));
process.exitCode = wins / N >= 0.98 ? 0 : 1;

// r15f 批量 deadline 清除器：对正向刀锋事件测前移余量，计算"新 +1/+2/+3 影区全净"的最小前移，
// 输出提案；--apply 落盘应用后的路线。不含 tap 对/连锁的配对逻辑（那类由 poscan 迭代纠偏）。
// 用法: node --import tsx TEMP/r15f/batchclear.mjs <route路径> <poscan输出log路径> [--apply <out路径>]
import { readFileSync, writeFileSync } from "node:fs";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const logPath = process.argv[3];
const applyIdx = process.argv.indexOf("--apply");
const applyPath = applyIdx > 0 ? process.argv[applyIdx + 1] : null;
const doc = JSON.parse(readFileSync(routePath, "utf8"));
const pool = new ScanPool(7);
const runShift = (side, idx, d) =>
  pool.run(doc.level, { totalFrames: doc.totalFrames, fb: patched(side, idx, d).fb, wg: patched(side, idx, d).wg }).then((r) => r.won);
function patched(side, idx, d) {
  const T = { fb: doc.fb.map((e) => ({ ...e })), wg: doc.wg.map((e) => ({ ...e })) };
  if (d !== 0) T[side][idx].f += d;
  return T;
}

// 解析 poscan log: "  wg#11@f958+1"
const blades = [];
for (const line of readFileSync(logPath, "utf8").split("\n")) {
  const m = line.match(/^\s+(fb|wg)#(\d+)@f(\d+)\+(\d+)\s*$/);
  if (m) blades.push({ side: m[1], idx: Number(m[2]), f: Number(m[3]), d: Number(m[4]) });
}
if (!blades.length) { console.error("poscan log 无刀锋项"); process.exit(2); }

// 每个刀锋事件（去重）：单事件平移 d∈[-6..3] 的干净集
const byEv = new Map();
for (const b of blades) {
  const key = `${b.side}#${b.idx}`;
  if (!byEv.has(key)) byEv.set(key, { side: b.side, idx: b.idx, f: b.f, dirs: [] });
  byEv.get(key).dirs.push(b.d);
}

const proposal = [];
for (const [key, ev] of byEv) {
  const tests = [];
  for (let d = -6; d <= 3; d++) if (d !== 0) tests.push(d);
  const rs = await Promise.all(tests.map((d) => runShift(ev.side, ev.idx, d).catch(() => false)));
  const clean = new Set([0]);
  tests.forEach((d, i) => { if (rs[i]) clean.add(d); });
  // 选 k：平移后名义自身必须 clean（clean.has(k)），且 k+1,k+2,k+3 ∈ clean 全净，|k| 最小优先
  let bestK = null;
  for (const k of [0, -1, -2, -3, -4, -5, -6]) {
    if (!clean.has(k)) continue;
    if ([1, 2, 3].every((s) => clean.has(k + s))) { bestK = k; break; }
  }
  let residual = null;
  if (bestK === null) {
    let bc = Infinity;
    for (const k of [0, -1, -2, -3, -4, -5, -6]) {
      if (!clean.has(k)) continue;
      const c = [1, 2, 3].filter((s) => !clean.has(k + s)).reduce((a, s) => a + { 1: 0.02, 2: 0.006, 3: 0.002 }[s], 0);
      if (c < bc - 1e-12) { bc = c; bestK = k; residual = c; }
    }
  }
  const W = { 1: 0.02, 2: 0.006, 3: 0.002 };
  const oldCost = ev.dirs.reduce((a, d) => a + W[d], 0);
  const newDirs = [1, 2, 3].filter((s) => bestK === null || !clean.has(bestK + s));
  const newCost = residual !== null ? residual : 0;
  proposal.push({ key, f: ev.f, dirs: ev.dirs, clean: [...clean].sort((a, b) => a - b), k: bestK, oldCost, newCost });
  console.log(`${key}@f${ev.f} +${ev.dirs.join("/+")} | clean=[${[...clean].sort((a, b) => a - b)}] | k=${bestK}${residual !== null ? ` (残余 ${residual.toFixed(4)})` : " (全净)"} cost ${oldCost.toFixed(4)}→${newCost.toFixed(4)}`);
}

if (applyPath) {
  const T = { fb: doc.fb.map((e) => ({ ...e })), wg: doc.wg.map((e) => ({ ...e })) };
  let n = 0;
  for (const p of proposal) {
    if (!p.k) continue;
    const [side, idxS] = p.key.split("#");
    T[side][Number(idxS)].f += p.k;
    n++;
  }
  writeFileSync(applyPath, JSON.stringify({ ...doc, fb: T.fb, wg: T.wg, source: `${doc.source}; batchclear ${new Date().toISOString().slice(0, 10)} ${n} 事件前移` }, null, 1));
  console.log(`\n已应用 ${n} 个前移 → ${applyPath}`);
}
pool.close();

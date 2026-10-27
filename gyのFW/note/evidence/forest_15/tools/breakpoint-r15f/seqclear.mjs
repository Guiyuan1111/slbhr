// r15f 顺序贪心清除器：批清实证不可组合（cand1 联合应用 41→78 爆炸），改为
// 每轮: poscan 全扫 → 取代价最高刀锋事件测 clean 集 → 选最优 k → 应用 → 下一轮 poscan 验收；
// 恶化则回滚并拉黑该 (event,k)，换次优继续。单调不升，全程可复现。
// 用法: node --import tsx TEMP/r15f/seqclear.mjs <route路径> <out路径> [--maxSteps 40] [--jobs 7]
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const outPath = process.argv[3];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const MAXSTEPS = Number(argOf(process.argv, "maxSteps", "40"));
const JOBS = Number(argOf(process.argv, "jobs", "7"));
const W = { 1: 0.02, 2: 0.006, 3: 0.002 };
const OFFS = [1, 2, 3];

const doc0 = JSON.parse(readFileSync(routePath, "utf8"));
const pool = new ScanPool(JOBS);
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const withShift = (T, side, idx, d) => {
  const TT = clone(T);
  if (d !== 0) TT[side][idx].f += d;
  return TT;
};
const runR = (T) => pool.run(doc0.level, { totalFrames: doc0.totalFrames, fb: T.fb, wg: T.wg });
const poscan = async (T) => {
  const jobs = [];
  for (const side of ["fb", "wg"])
    for (let i = 0; i < T[side].length; i++)
      for (const d of OFFS) jobs.push({ side, i, d, T: withShift(T, side, i, d) });
  const rs = await Promise.all(jobs.map((j) => runR(j.T).then((r) => ({ ...j, won: r.won })).catch(() => ({ ...j, won: false }))));
  const fatal = rs.filter((x) => !x.won);
  const cost = fatal.reduce((a, x) => a + W[x.d], 0);
  return { fatal, cost };
};

let cur = clone(doc0);
const base = await runR(cur);
if (!base.won) { console.error("基线必须 WIN"); process.exit(2); }
let curState = await poscan(cur);
console.log(`初始: ${curState.fatal.length} 项 cost ${curState.cost.toFixed(4)}`);

const blacklist = new Set();
let steps = 0;
while (steps < MAXSTEPS && curState.fatal.length > 0) {
  steps++;
  // 取当前代价最高的事件（同事件多方向合计；平级取先出现）
  const byEv = new Map();
  for (const f of curState.fatal) {
    const key = `${f.side}#${f.i}`;
    byEv.set(key, (byEv.get(key) ?? 0) + W[f.d]);
  }
  const order = [...byEv.entries()].sort((a, b) => b[1] - a[1]);
  let adopted = false;
  for (const [key] of order) {
    const [side, idxS] = key.split("#");
    const idx = Number(idxS);
    // clean 集：d∈[-6..3]
    const tests = [];
    for (let d = -6; d <= 3; d++) if (d !== 0) tests.push(d);
    const rs = await Promise.all(tests.map((d) => runR(withShift(cur, side, idx, d)).then((r) => r.won).catch(() => false)));
    const clean = new Set([0]);
    tests.forEach((d, i) => { if (rs[i]) clean.add(d); });
    // 选 k: 名义 clean 且影区全净 |k| 最小；否则残余最小
    let bestK = null, bestC = Infinity;
    for (const k of [0, -1, -2, -3, -4, -5, -6]) {
      if (!clean.has(k) || blacklist.has(`${key}:${k}`)) continue;
      const c = [1, 2, 3].filter((s) => !clean.has(k + s)).reduce((a, s) => a + W[s], 0);
      if (c < bestC - 1e-12) { bestC = c; bestK = k; }
      if (c === 0) break;
    }
    if (!bestK || (bestK === 0 && bestC >= byEv.get(key) - 1e-12)) { continue; } // 无可行动作
    const cand = withShift(cur, side, idx, bestK);
    const candState = await poscan(cand);
    if (candState.cost < curState.cost - 1e-12) {
      cur = cand;
      console.log(`step${steps}: ${key}@f${doc0[side][idx].f} ${bestK >= 0 ? "+" : ""}${bestK} ✓ cost ${curState.cost.toFixed(4)}→${candState.cost.toFixed(4)}（${curState.fatal.length}→${candState.fatal.length} 项）`);
      curState = candState;
      copyFileSync(routePath, outPath + ".bak");
      writeFileSync(outPath, JSON.stringify({ ...doc0, fb: cur.fb, wg: cur.wg, source: `${doc0.source}; seqclear step${steps} ${key}${bestK}` }, null, 1));
      adopted = true;
      break;
    } else {
      blacklist.add(`${key}:${bestK}`);
      console.log(`step${steps}: ${key} ${bestK} ✗ 全局 ${curState.cost.toFixed(4)}→${candState.cost.toFixed(4)}，回滚拉黑`);
    }
  }
  if (!adopted && steps >= MAXSTEPS) break;
  // 若本轮 order 全部无可行动作且未采纳：防死循环
  if (!adopted) {
    let anyMove = false;
    for (const [key] of order) {
      for (const k of [-1, -2, -3]) if (!blacklist.has(`${key}:${k}`)) anyMove = true;
    }
    if (!anyMove) { console.log("全部拉黑，收敛退出"); break; }
  }
}
console.log(`终态: ${curState.fatal.length} 项 cost ${curState.cost.toFixed(4)}（MC 期望失败 ≈${(100 * curState.cost).toFixed(1)}%）`);
for (const f of curState.fatal) console.log(`  ${f.side}#${f.i}@f${doc0[f.side][f.i].f}+${f.d}`);
pool.close();

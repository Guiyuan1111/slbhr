// r15f 结构补丁清除器：seqclear 只会单事件位移（down/up 单边动必破坏自身耦合的拍子动不了），
// 本工具扩展两种走法，接受/回滚/拉黑纪律与 seqclear.mjs 完全一致（poscan 严格下降才采纳）：
//   A. pair-shift：把一拍 (down@fd, up@fu) 两边同移 k（按长不变，整拍相位平移）；
//   B. re-tap：释放后补一拍 {fu+o down, fu+o+1 up}（新边沿，捕获原 down 的 +2/+3 滑移；
//      跳跃类机制空中再按为 no-op，无害性由 WIN 检查兜底）。
// 只处理残余 fatal 里出现的事件（按权重降序），k/o 拉黑防绕圈。
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/insclear.mjs <route路径> <out路径> [--maxSteps 60] [--jobs 5]
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const outPath = process.argv[3];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const MAXSTEPS = Number(argOf(process.argv, "maxSteps", "60"));
const JOBS = Number(argOf(process.argv, "jobs", "5"));
const W = { 1: 0.02, 2: 0.006, 3: 0.002 };
const OFFS = [1, 2, 3];

const doc0 = JSON.parse(readFileSync(routePath, "utf8"));
const pool = new ScanPool(JOBS);
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const runR = (T) => pool.run(doc0.level, { totalFrames: doc0.totalFrames, fb: T.fb, wg: T.wg });
const poscan = async (T) => {
  const jobs = [];
  for (const side of ["fb", "wg"])
    for (let i = 0; i < T[side].length; i++)
      for (const d of OFFS) {
        const TT = clone(T);
        TT[side][i].f += d;
        jobs.push({ side, i, d, T: TT });
      }
  const rs = await Promise.all(jobs.map((j) => runR(j.T).then((r) => ({ ...j, won: r.won })).catch(() => ({ ...j, won: false }))));
  const fatal = rs.filter((x) => !x.won);
  const cost = fatal.reduce((a, x) => a + W[x.d], 0);
  return { fatal, cost };
};

// 找事件 i 所在的拍：type=down → 配它之后同 dir 首个 up；type=up → 配它之前同 dir 最近 down
function tapOf(T, side, i) {
  const evs = T[side];
  const e = evs[i];
  if (e.type === "down") {
    for (let j = i + 1; j < evs.length; j++)
      if (evs[j].dir === e.dir && evs[j].type === "up") return { di: i, ui: j };
  } else {
    for (let j = i - 1; j >= 0; j--)
      if (evs[j].dir === e.dir && evs[j].type === "down") return { di: j, ui: i };
  }
  return null;
}
const withPair = (T, side, tap, k) => {
  const TT = clone(T);
  TT[side][tap.di].f += k;
  TT[side][tap.ui].f += k;
  TT[side].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
  return TT;
};
const withRetap = (T, side, tap, o) => {
  const TT = clone(T);
  const d = TT[side][tap.di];
  TT[side].push({ f: TT[side][tap.ui].f + o, dir: d.dir, type: "down" });
  TT[side].push({ f: TT[side][tap.ui].f + o + 1, dir: d.dir, type: "up" });
  TT[side].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
  return TT;
};

let cur = clone(doc0);
const base = await runR(cur);
if (!base.won) { console.error("基线必须 WIN"); process.exit(2); }
let curState = await poscan(cur);
console.log(`初始: ${curState.fatal.length} 项 cost ${curState.cost.toFixed(4)}`);

// 残余 fatal 涉及的事件（按每事件合计权重降序）。标签用事件身份（frame+dir+type）而非索引——
// retap 会插入事件使索引漂移，身份在插入/排序后不变（同 f 同 dir 同 type 视为同一事件）。
const evKey = (side, i) => { const e = cur[side][i]; return `${side}@${e.f}@${e.dir}@${e.type}`; };
const rank = () => {
  const byEv = new Map();
  for (const f of curState.fatal) {
    const key = evKey(f.side, f.i);
    byEv.set(key, (byEv.get(key) ?? 0) + W[f.d]);
  }
  return [...byEv.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
};

const blacklist = new Set();
let steps = 0;
outer: while (steps < MAXSTEPS && curState.fatal.length > 0) {
  steps++;
  let adopted = false;
  for (const key of rank()) {
    const [sideS, fS, dirS, typeS] = key.split("@");
    const side = sideS, f0 = Number(fS);
    const idx = cur[side].findIndex((e) => e.f === f0 && e.dir === dirS && e.type === typeS);
    if (idx < 0) continue;
    const tap = tapOf(cur, side, idx);
    if (!tap) continue;
    const cands = [];
    for (const k of [-3, -2, -1, 1, 2, 3]) cands.push({ kind: `pair${k >= 0 ? "+" : ""}${k}`, T: withPair(cur, side, tap, k) });
    for (const o of [1, 2, 3, 5, 8, 13]) cands.push({ kind: `retap+${o}`, T: withRetap(cur, side, tap, o) });
    for (const c of cands) {
      const tag = `${key}:${c.kind}`;
      if (blacklist.has(tag)) continue;
      if (!c.T) { blacklist.add(tag); continue; }
      const win = await runR(c.T).then((r) => r.won).catch(() => false);
      if (!win) { blacklist.add(tag); continue; }
      const st = await poscan(c.T);
      if (st.cost < curState.cost - 1e-12) {
        cur = c.T;
        console.log(`step${steps}: ${key} ${c.kind} ✓ cost ${curState.cost.toFixed(4)}→${st.cost.toFixed(4)}（${curState.fatal.length}→${st.fatal.length} 项）`);
        curState = st;
        copyFileSync(routePath, outPath + ".bak");
        writeFileSync(outPath, JSON.stringify({ ...doc0, fb: cur.fb, wg: cur.wg, source: `${doc0.source}; insclear step${steps} ${key} ${c.kind}` }, null, 1));
        adopted = true;
        continue outer;
      }
      blacklist.add(tag);
      console.log(`step${steps}: ${key} ${c.kind} ✗ 全局 ${curState.cost.toFixed(4)}→${st.cost.toFixed(4)}，回滚拉黑`);
    }
  }
  if (!adopted) { console.log("本轮零采纳，收敛退出"); break; }
}
console.log(`终态: ${curState.fatal.length} 项 cost ${curState.cost.toFixed(4)}（MC 期望失败 ≈${(100 * curState.cost).toFixed(1)}%）`);
for (const f of curState.fatal) console.log(`  ${f.side}[${f.i}]@f${cur[f.side][f.i].f}+${f.d}`);
pool.close();

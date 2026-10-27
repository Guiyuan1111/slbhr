// r15f MC 爬山修复器 v3：直接以 150 轮 seed42 MC 赢场数为目标函数。
// 正确性：候选一律自抽流（draw42(doc)），trial t 的抽取序只依赖前 t 个 trial 的抽取次数，
// 同事件数候选的失败 trial 子集运行=全 MC 的对应切片（快筛精确）；插入类跳过快筛直接全 MC。
// 流构建与 mc.mjs 逐位一致：按文件数组序抽取（先 fb 后 wg），抖动后同帧 up 先排序。
// 循环: 杀手归因(单滑移隔离) → 杀手事件结构候选(单移/整拍平移/释放后补拍) → 快筛 → 全 MC 验收。
// 护栏: 采纳需赢场严格增加；poscan cost 恶化 >0.05 否决；seed43 陪跑记录(不门禁)。
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/mcfix.mjs <route路径> <out路径> [--target 148] [--rounds 30] [--jobs 6]
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const outPath = process.argv[3];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const TARGET = Number(argOf(process.argv, "target", "148"));
const ROUNDS = Number(argOf(process.argv, "rounds", "30"));
const JOBS = Number(argOf(process.argv, "jobs", "6"));
const N = 150, W = { 1: 0.02, 2: 0.006, 3: 0.002 }, OFFS = [1, 2, 3];

const doc0 = JSON.parse(readFileSync(routePath, "utf8"));
const pool = new ScanPool(JOBS);
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const sortKey = (a, b) => a.f - b.f || (a.type === "up" ? -1 : 1);

function mkDraw(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const slip = () => { const r = rand(); if (r < 0.02) return 1; if (r < 0.026) return 2; if (r < 0.028) return 3; return 0; };
  return (doc) => {
    s = seed >>> 0;
    const stream = [];
    for (let t = 0; t < N; t++) {
      const dm = (arr) => arr.map((e) => ({ e: { ...e }, d: slip() }));
      const fb = dm(doc.fb), wg = dm(doc.wg);
      const jit = (a) => a.map((x) => ({ ...x.e, f: x.e.f + x.d })).sort(sortKey);
      stream.push({ fb, wg, fbJ: jit(fb), wgJ: jit(wg) });
    }
    return stream;
  };
}
const draw42 = mkDraw(42), draw43 = mkDraw(43);
const trialDoc = (stream, t) => ({ ...doc0, fb: stream[t].fbJ, wg: stream[t].wgJ });
const runDoc = (d) => pool.run(doc0.level, { totalFrames: doc0.totalFrames, fb: d.fb, wg: d.wg }).then((r) => r.won).catch(() => false);

async function mcRun(doc, drawFn, only) {
  const stream = drawFn(doc);
  const idx = only ?? stream.map((_, i) => i);
  const rs = await Promise.all(idx.map((t) => runDoc(trialDoc(stream, t))));
  return { stream, wins: rs.filter(Boolean).length, fails: idx.filter((_, k) => !rs[k]) };
}
// poscan：按 (side,i,d) 权重求和（±1/±2/±3 全事件）
async function poscanCostReal(doc) {
  const jobs = [];
  for (const side of ["fb", "wg"])
    for (let i = 0; i < doc[side].length; i++)
      for (const d of OFFS) {
        const TT = clone(doc);
        TT[side][i].f += d;
        jobs.push({ d, T: TT });
      }
  const rs = await Promise.all(jobs.map((j) => runDoc(j.T)));
  return jobs.reduce((a, j, k) => a + (rs[k] ? 0 : W[j.d]), 0);
}

// ---- 候选生成（基于 cur 索引）----
let cur = null;
function tapOf(side, i) {
  const evs = cur[side], e = evs[i];
  if (e.type === "down") { for (let j = i + 1; j < evs.length; j++) if (evs[j].dir === e.dir && evs[j].type === "up") return { di: i, ui: j }; }
  else { for (let j = i - 1; j >= 0; j--) if (evs[j].dir === e.dir && evs[j].type === "down") return { di: j, ui: i }; }
  return null;
}
function buildCand(kind, p, side, i) {
  if (kind === "shiftD") {
    const T = clone(cur);
    T[side][i].f += p.k;
    return { doc: T, inserted: false };
  }
  if (kind === "pair") {
    const t = tapOf(side, i); if (!t) return null;
    const T = clone(cur);
    T[side][t.di].f += p.k; T[side][t.ui].f += p.k;
    T[side].sort(sortKey);
    return { doc: T, inserted: false };
  }
  if (kind === "retap") {
    const t = tapOf(side, i); if (!t) return null;
    const T = clone(cur);
    const dir = T[side][t.di].dir;
    T[side].push({ f: T[side][t.ui].f + p.o, dir, type: "down" });
    T[side].push({ f: T[side][t.ui].f + p.o + 1, dir, type: "up" });
    T[side].sort(sortKey);
    return { doc: T, inserted: true };
  }
  return null;
}
const CANDS = [
  ...[-3, -2, -1, 1, 2, 3].map((k) => ({ kind: "shiftD", p: { k }, label: `shiftD${k >= 0 ? "+" : ""}${k}` })),
  ...[-3, -2, -1, 1, 2, 3].map((k) => ({ kind: "pair", p: { k }, label: `pair${k >= 0 ? "+" : ""}${k}` })),
  ...[1, 2, 3, 5, 8].map((o) => ({ kind: "retap", p: { o }, label: `retap+${o}` })),
];

// ---- 主循环 ----
cur = clone(doc0);
let base = await mcRun(cur, draw42);
let cost = await poscanCostReal(cur);
let best = { wins: base.wins, fails: base.fails, cost, stream: base.stream };
console.log(`基线: MC ${base.wins}/${N}（fails ${base.fails.length}）poscan cost ${cost.toFixed(4)}`);

const blacklist = new Set();
for (let round = 1; round <= ROUNDS && best.wins < TARGET; round++) {
  // 杀手归因：失败 trial 的每个滑移事件单滑移隔离
  const isoJobs = [];
  for (const t of best.fails) {
    const tr = best.stream[t];
    tr.fb.forEach((x, i) => { if (x.d) isoJobs.push({ t, side: "fb", i }); });
    tr.wg.forEach((x, i) => { if (x.d) isoJobs.push({ t, side: "wg", i }); });
  }
  const isoDocs = isoJobs.map((j) => {
    const T = clone(cur);
    const tr = best.stream[j.t];
    T.fb = T.fb.map((e, i) => ({ ...e, f: e.f + (j.side === "fb" && j.i === i ? tr.fb[i].d : 0) })).sort(sortKey);
    T.wg = T.wg.map((e, i) => ({ ...e, f: e.f + (j.side === "wg" && j.i === i ? tr.wg[i].d : 0) })).sort(sortKey);
    return T;
  });
  const isoRs = await Promise.all(isoDocs.map(runDoc));
  const killerMap = new Map();
  isoJobs.forEach((j, k) => {
    if (!isoRs[k]) {
      const e = cur[j.side][j.i];
      const key = `${j.side}@${e.f}@${e.dir}@${e.type}`;
      const ent = killerMap.get(key) ?? { key, side: j.side, i: j.i, trials: new Set() };
      ent.trials.add(j.t);
      killerMap.set(key, ent);
    }
  });
  const killers = [...killerMap.values()].sort((a, b) => b.trials.size - a.trials.size);
  console.log(`\nround ${round}: 失败 ${best.fails.length}，杀手 ${killers.length}: ${killers.slice(0, 8).map((k) => `${k.key}(${k.trials.size})`).join(" ")}`);

  let adopted = false;
  for (const kl of killers) {
    for (const g of CANDS) {
      const tag = `${kl.key}|${g.label}`;
      if (blacklist.has(tag)) continue;
      const cand = buildCand(g.kind, g.p, kl.side, kl.i);
      if (!cand) { blacklist.add(tag); continue; }
      if (!cand.inserted) {
        const prune = await mcRun(cand.doc, draw42, best.fails);
        if (prune.wins === 0) { blacklist.add(tag); continue; } // 一个失败 trial 都修不动
      }
      const full = await mcRun(cand.doc, draw42);
      if (full.wins > best.wins) {
        const costNew = await poscanCostReal(cand.doc);
        if (costNew > best.cost + 0.05) { console.log(`round ${round}: ${tag} +${full.wins - best.wins} 场但 poscan 爆冲 ${best.cost.toFixed(3)}→${costNew.toFixed(3)}，否决`); blacklist.add(tag); continue; }
        const w43 = (await mcRun(cand.doc, draw43)).wins;
        cur = cand.doc;
        best = { wins: full.wins, fails: full.fails, cost: costNew, stream: full.stream };
        console.log(`round ${round}: ${tag} ✓ MC ${best.wins}/${N}（fails ${best.fails.length}，seed43 陪跑 ${w43}/${N}，cost ${costNew.toFixed(4)}）`);
        copyFileSync(routePath, outPath + ".bak");
        writeFileSync(outPath, JSON.stringify({ ...doc0, fb: cur.fb, wg: cur.wg, source: `${doc0.source}; mcfix r${round} ${tag} MC${full.wins}` }, null, 1));
        adopted = true;
        break;
      }
      blacklist.add(tag);
    }
    if (adopted) break;
  }
  if (!adopted) { console.log(`round ${round}: 零采纳，收敛退出`); break; }
}
console.log(`\n终态: MC ${best.wins}/${N}（${(100 * best.wins / N).toFixed(1)}%）fails [${best.fails.join(",")}] cost ${best.cost.toFixed(4)}`);
pool.close();
process.exitCode = best.wins / N >= 0.98 ? 0 : 1;

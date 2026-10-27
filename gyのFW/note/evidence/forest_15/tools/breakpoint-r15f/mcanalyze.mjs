// r15f MC 失败归因：复刻 mcany.mjs 的抖动流（同 LCG/同事件序/同 seed），
// 对每个失败 trial 做单滑移隔离——只保留事件 e 的滑移、其余归位，若仍失败则 e 为该 trial 的杀手。
// 输出按"独立击杀 trial 数"排序的杀手清单（JSON + 摘要）。
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/mcanalyze.mjs <route路径> [--trials 150] [--seed 42]
import { readFileSync, writeFileSync } from "node:fs";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const ROUTE = process.argv[2];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const N = Number(argOf(process.argv, "trials", "150"));
const SEED = Number(argOf(process.argv, "seed", "42"));

let s = SEED >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;
  if (r < 0.026) return 2;
  if (r < 0.028) return 3;
  return 0;
}

const doc = JSON.parse(readFileSync(ROUTE, "utf8"));
// 与 mcany 完全一致的抽取序：每 trial 先 fb 全部事件、后 wg 全部事件（文件顺序），然后各自排序
const trialJitter = () => {
  const j = (arr) => arr
    .map(e => { const d = slip(); return { e, d }; })
    .map(x => ({ ...x, applied: x.d ? { ...x.e, f: x.e.f + x.d } : x.e }));
  const fb = j(doc.fb), wg = j(doc.wg);
  const sortArr = (a) => [...a].sort((x, y) => x.applied.f - y.applied.f || (x.applied.type === "up" ? -1 : 1));
  return { fb, wg, fbS: sortArr(fb), wgS: sortArr(wg) };
};
const buildDoc = (fbj, wgj) => ({ ...doc, fb: fbj.map(x => x.applied), wg: wgj.map(x => x.applied) });
const isoDoc = (fbj, wgj, keep) => {
  // 只保留 keep {side, i} 的滑移，其余归位
  const m = (arr, side) => arr.map((x, i) => (keep.side === side && keep.i === i ? x.applied : x.e));
  return { ...doc, fb: m(fbj, "fb"), wg: m(wgj, "wg") };
};
const run = (d) => runKernel(doc.level, d, {});

const fails = [];
for (let i = 0; i < N; i++) {
  const { fb, wg, fbS, wgS } = trialJitter();
  const res = run(buildDoc(fbS, wgS));
  if (!res.won) fails.push({ i, fb, wg, res });
}
console.log(`复刻 MC: ${N - fails.length}/${N} wins（应与 mcany 一致）`);

const killers = new Map(); // key -> {side,i,f,dir,type,trials:[...]}
for (const fail of fails) {
  const sl = [];
  fail.fb.forEach((x, i) => { if (x.d) sl.push({ side: "fb", i, d: x.d, e: x.e }); });
  fail.wg.forEach((x, i) => { if (x.d) sl.push({ side: "wg", i, d: x.d, e: x.e }); });
  // 单滑移隔离（同步顺序跑，池外串行即可——量小）
  for (const z of sl) {
    const r = run(isoDoc(fail.fb, fail.wg, z));
    if (!r.won) {
      const key = `${z.side}@${z.e.f}@${z.e.dir}@${z.e.type}`;
      if (!killers.has(key)) killers.set(key, { side: z.side, i: z.i, f: z.e.f, dir: z.e.dir, type: z.e.type, d: z.d, trials: [] });
      killers.get(key).trials.push(fail.i);
    }
  }
  if (sl.length === 0) console.log(`trial ${fail.i}: 无滑移仍失败（基线问题？）`);
}
const list = [...killers.values()].sort((a, b) => b.trials.length - a.trials.length);
console.log(`\n失败 ${fails.length} 个 trial，杀手 ${list.length} 个（单滑移即可独立击杀）:`);
for (const k of list) console.log(`  ${k.side}[${k.i}]@f${k.f} ${k.dir}/${k.type} +${k.d} → 独杀 trials [${k.trials.join(",")}]`);
// 未被任何单滑移解释的失败 trial（多滑移联合致死）
const explained = new Set(list.flatMap(k => k.trials));
const unexplained = fails.map(f => f.i).filter(i => !explained.has(i));
console.log(`未被单滑移解释的 trial: [${unexplained.join(",")}]`);
writeFileSync(ROUTE.replace(/\.json$/, "") + ".killers.json", JSON.stringify({ route: ROUTE, seed: SEED, trials: N, fails: fails.map(f => f.i), killers: list, unexplained }, null, 1));
console.log(`已写 ${ROUTE.replace(/\.json$/, "")}.killers.json`);

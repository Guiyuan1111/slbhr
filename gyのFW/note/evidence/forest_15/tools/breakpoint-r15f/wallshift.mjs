// r15f 尾段整块平移重定相: 墙定位后 wg 站稳时刻与 7430+ 尾段(块内相位自洽)之间是定时交互，
// 整块平移尾段([LO,8500] 内 fb+wg 全事件同移 k)重对相心。每候选全 MC seed42，TOP3 过 43/44。
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/wallshift.mjs <route路径> [--jobs 6]
import { readFileSync } from "node:fs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const JOBS = Number(argOf(process.argv, "jobs", "6"));
const N = 150;
const doc0 = JSON.parse(readFileSync(routePath, "utf8"));
const sortKey = (a, b) => a.f - b.f || (a.type === "up" ? -1 : 1);
const pool = new ScanPool(JOBS);
function mkDraw(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const slip = () => { const r = rand(); if (r < 0.02) return 1; if (r < 0.026) return 2; if (r < 0.028) return 3; return 0; };
  return (doc) => {
    s = seed >>> 0;
    const st = [];
    for (let t = 0; t < N; t++) {
      const dm = (arr) => arr.map((e) => ({ e: { ...e }, d: slip() }));
      const fb = dm(doc.fb), wg = dm(doc.wg);
      const jit = (a) => a.map((x) => ({ ...x.e, f: x.e.f + x.d })).sort(sortKey);
      st.push({ fbJ: jit(fb), wgJ: jit(wg) });
    }
    return st;
  };
}
const d42 = mkDraw(42), d43 = mkDraw(43), d44 = mkDraw(44);
const runDoc = (d) => pool.run(doc0.level, { totalFrames: doc0.totalFrames, fb: d.fb, wg: d.wg }).then((r) => r.won).catch(() => false);
async function mc(doc, draw) {
  const st = draw(doc);
  const rs = await Promise.all(st.map((tr) => runDoc({ ...doc0, fb: tr.fbJ, wg: tr.wgJ })));
  return rs.filter(Boolean).length;
}
function build(LO, k) {
  const T = { ...doc0, fb: doc0.fb.map((e) => ({ ...e })), wg: doc0.wg.map((e) => ({ ...e })) };
  T.fb = T.fb.map((e) => (e.f >= LO ? { ...e, f: e.f + k } : e));
  T.wg = T.wg.map((e) => (e.f >= LO ? { ...e, f: e.f + k } : e));
  return T;
}
const results = [];
for (const LO of [7400, 7420, 7360]) {
  for (const k of [-6, -4, -3, -2, -1, 1, 2, 3, 4, 6]) {
    const w = await mc(build(LO, k), d42);
    results.push({ LO, k, w42: w });
    console.log(`LO=${LO} k=${k >= 0 ? "+" : ""}${k}: MC42 ${w}/150`);
  }
}
results.sort((a, b) => b.w42 - a.w42);
console.log("\nTOP4 三种子:");
for (const r of results.slice(0, 4)) {
  const T = build(r.LO, r.k);
  console.log(`LO=${r.LO} k=${r.k}: 42=${r.w42} 43=${await mc(T, d43)} 44=${await mc(T, d44)}`);
}
pool.close();

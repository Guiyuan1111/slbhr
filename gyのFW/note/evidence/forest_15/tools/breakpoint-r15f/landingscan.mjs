// r15f 落点解耦扫描：6990 起跳后 right 按住 69f 贯穿全程飞行 → 落点对起飞延迟敏感（+1f≈+37px）。
// 候选=在固定帧 R 插入 right/up（摩擦截断漂移），每候选全 MC(seed42) 评分；插入改抖动流，全 MC 是唯一诚实评分。
// 用法: node --import tsx TEMP/r15f/landingscan.mjs <route路径> [--lo 6996] [--hi 7052] [--jobs 6]
import { readFileSync } from "node:fs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const LO = Number(argOf(process.argv, "lo", "6996"));
const HI = Number(argOf(process.argv, "hi", "7052"));
const JOBS = Number(argOf(process.argv, "jobs", "6"));
const N = 150;

const doc0 = JSON.parse(readFileSync(routePath, "utf8"));
const pool = new ScanPool(JOBS);
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
      stream.push({ fbJ: jit(fb), wgJ: jit(wg) });
    }
    return stream;
  };
}
const draw42 = mkDraw(42), draw43 = mkDraw(43), draw44 = mkDraw(44);
const runDoc = (d) => pool.run(doc0.level, { totalFrames: doc0.totalFrames, fb: d.fb, wg: d.wg }).then((r) => r.won).catch(() => false);
async function mc(doc, draw) {
  const stream = draw(doc);
  const rs = await Promise.all(stream.map((tr) => runDoc({ ...doc0, fb: tr.fbJ, wg: tr.wgJ })));
  return rs.filter(Boolean).length;
}

const base = JSON.parse(readFileSync(routePath, "utf8"));
console.log(`基线 MC42: ${await mc(base, draw42)}/150`);
const results = [];
for (let R = LO; R <= HI; R++) {
  const T = { ...base, wg: [...base.wg, { f: R, dir: "right", type: "up" }].sort(sortKey) };
  const w42 = await mc(T, draw42);
  results.push({ R, w42 });
  console.log(`right/up@${R}: MC42 ${w42}/150`);
}
results.sort((a, b) => b.w42 - a.w42);
console.log("\nTOP6:");
for (const r of results.slice(0, 6)) {
  const T = { ...base, wg: [...base.wg, { f: r.R, dir: "right", type: "up" }].sort(sortKey) };
  const w43 = await mc(T, draw43), w44 = await mc(T, draw44);
  console.log(`right/up@${r.R}: 42=${r.w42} 43=${w43} 44=${w44}（均值 ${((r.w42 + w43 + w44) / 3).toFixed(1)}）`);
}
pool.close();

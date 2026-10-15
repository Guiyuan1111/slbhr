// diag1: 复现 MC(seed42) 失败 trial → 抖动事件清单 + 首发散散帧 + 末态位置
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const N = Number(process.argv[2] ?? 40);
let s = 42 >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;
  if (r < 0.026) return 2;
  if (r < 0.028) return 3;
  return 0;
}
// 与 mc.mjs 相同顺序: jitter(fb) 先于 jitter(wg), 每 trial 两条流
let tri = 0;
const jitter = (arr) => arr
  .map((e, i) => { const d = slip(); return { e, i, d }; })
  .map(({ e, i, d }) => ({ ...e, f: e.f + d, _i: i, _d: d }))
  .sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

const nom = [];
runKernel("forest_15", doc, { traceTo: nom });
console.log("nominal frames:", nom.length);

let wins = 0;
for (let t = 0; t < N; t++) {
  tri = t;
  const fb = jitter(doc.fb), wg = jitter(doc.wg);
  const hit = [
    ...fb.filter(e => e._d).map(e => `fb#${e._i}(f${doc.fb[e._i].f},+${e._d})`),
    ...wg.filter(e => e._d).map(e => `wg#${e._i}(f${doc.wg[e._i].f},+${e._d})`),
  ];
  const tr = [];
  const res = runKernel("forest_15", { ...doc, fb, wg }, { traceTo: tr });
  if (res.won) { wins++; continue; }
  // 首发散散: |Δ|>20px 且 50 帧后仍 >20px
  let first = -1, fx = "";
  const M = Math.min(tr.length, nom.length) - 50;
  for (let k = 0; k < M; k++) {
    const dv = Math.max(Math.abs(tr[k].fb[0] - nom[k].fb[0]), Math.abs(tr[k].wg[0] - nom[k].wg[0]));
    const dv2 = Math.max(Math.abs(tr[k + 50].fb[0] - nom[k + 50].fb[0]), Math.abs(tr[k + 50].wg[0] - nom[k + 50].wg[0]));
    if (dv > 20 && dv2 > 20) {
      first = tr[k].f;
      fx = `div@f${tr[k].f} fb(${tr[k].fb[0] | 0},${tr[k].fb[1] | 0}) nom fb(${nom[k].fb[0] | 0},${nom[k].fb[1] | 0}) | wg(${tr[k].wg[0] | 0},${tr[k].wg[1] | 0}) nom wg(${nom[k].wg[0] | 0},${nom[k].wg[1] | 0})`;
      break;
    }
  }
  const last = tr[tr.length - 1] ?? nom[nom.length - 1];
  console.log(`FAIL trial=${t} ${res.deathF >= 0 ? "death@" + res.deathF : "timeout"} ${fx}`);
  console.log(`   end: fb(${last.fb[0] | 0},${last.fb[1] | 0}) wg(${last.wg[0] | 0},${last.wg[1] | 0}) hits=[${hit.join(" ")}]`);
}
console.log(`(${wins}/${N} win in this prefix)`);

// diag4: v41 失败 trial 逐段追踪 — 找每个 trial 的真实致命关节
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
let s = 42 >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;
  if (r < 0.026) return 2;
  if (r < 0.028) return 3;
  return 0;
}
const jitter = (arr) => arr
  .map(e => { const d = slip(); return d ? { ...e, f: e.f + d } : e; })
  .sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

const TARGETS = [0, 5, 18, 23, 27, 37];
const nom = [];
runKernel("forest_15", doc, { traceTo: nom });

for (let t = 0; t <= Math.max(...TARGETS); t++) {
  const fb = jitter(doc.fb), wg = jitter(doc.wg);
  if (!TARGETS.includes(t)) continue;
  const tr = [];
  const res = runKernel("forest_15", { ...doc, fb, wg }, { traceTo: tr });
  console.log(`\n===== trial ${t} won=${res.won} =====`);
  // 关键关节帧附近对比: 每 100f 打 x 差, >25px 标记
  let lastMark = -999;
  for (let f = 0; f < Math.min(tr.length, nom.length); f += 1) {
    const dx = Math.abs(tr[f].wg[0] - nom[f].wg[0]);
    const dfx = Math.abs(tr[f].fb[0] - nom[f].fb[0]);
    if ((dx > 25 || dfx > 25) && f - lastMark >= 100) {
      lastMark = f;
      console.log(`  div f${f}: fb(${tr[f].fb[0] | 0},${tr[f].fb[1] | 0}) nom(${nom[f].fb[0] | 0},${nom[f].fb[1] | 0}) | wg(${tr[f].wg[0] | 0},${tr[f].wg[1] | 0}) nom(${nom[f].wg[0] | 0},${nom[f].wg[1] | 0})`);
    }
  }
  // 末段轨迹
  const L = tr.length;
  for (let f = Math.max(0, L - 900); f < L; f += 150) {
    const r = tr[f];
    console.log(`  tail f${f}: fb(${r.fb[0] | 0},${r.fb[1] | 0}) wg(${r.wg[0] | 0},${r.wg[1] | 0})`);
  }
}

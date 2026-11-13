/**
 * 选关树烘焙内核配对 A/B（r49 新增）。
 *
 * ## 为什么需要
 * `perf-bake-cpu.mjs` 量的是**分阶段绝对耗时**，能看结构但不能判「某次改写值多少」——
 * 同进程前后对比会被 JIT 预热与 GC 污染。本件做**配对 A/B**：同进程交替跑参照臂与当前
 * 臂，用区间是否分离判定，并把**位级一致**作为每轮的硬门禁（不一致立即退出 1）。
 *
 * ## 为什么必须用真实数据
 * r49 实测教训：`bevelColorMatrix` 改表驱动时漏了一个 `fr()`，33 条合成单测全绿，
 * 但真实数据一跑就红（字节偏移 613864）。事后量化：漏 `fr` 在 24×20 随机噪声下
 * 144000 像素显形 **0 次**、均匀块 255 种 alpha 也 **0 次**——只在全画布 1036×864 的
 * 真实结构下才跨过 Uint8 台阶。**合成输入不能替代真实数据做等价性判定。**
 *
 * ## 真实数据来源
 * `benchmark/dump-tree-alpha.mjs` 从页面 `getImageData` 导出三层原始 alpha 到
 * `benchmark/results/alpha-<temple>-l*.bin`。缺该文件时本件报错退出，不退回合成输入。
 *
 * 用法：
 *   node --import tsx benchmark/dump-tree-alpha.mjs          # 先导出真实 alpha
 *   node --import tsx benchmark/perf-bevel.mjs
 *   node --import tsx benchmark/perf-bevel.mjs --save r49-bevel
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bevelColorMatrix, buildSAT, outlinePass } from "../packages/client/src/scenes/templeTreeBake.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const TEMPLE = process.env.TEMPLE ?? "forest";
const ROUNDS = Number(process.env.ROUNDS ?? 9);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// ── 参照臂：r49 改造前的实现（三角函数/偏移量写在逐像素内层，无表驱动） ──────────
const fr = Math.fround;
function sampleA2Ref(al, w, h, tx, ty) {
  const px = tx - 0.5, py = ty - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const fxx = px - x0, fyy = py - y0;
  const xa = x0 < 0 ? 0 : x0 >= w ? w - 1 : x0, xb = x0 + 1 < 0 ? 0 : x0 + 1 >= w ? w - 1 : x0 + 1;
  const ya = y0 < 0 ? 0 : y0 >= h ? h - 1 : y0, yb = y0 + 1 < 0 ? 0 : y0 + 1 >= h ? h - 1 : y0 + 1;
  const r0 = ya * w, r1 = yb * w;
  const top = al[r0 + xa] * (1 - fxx) + al[r0 + xb] * fxx;
  const bot = al[r1 + xa] * (1 - fxx) + al[r1 + xb] * fxx;
  return (top * (1 - fyy) + bot * fyy) / 255;
}
function loopOffsetsRef(thickness) {
  const maxStep = fr(parseFloat(String(1 / thickness)));
  const step = fr(parseFloat(String(1 / thickness / 3)));
  const out = [];
  for (let cur = 0; cur < maxStep; cur = fr(cur + step)) out.push(cur);
  return out;
}
function satSumRef(s, stride, hh, x0, y0, x1, y1) {
  const xa = Math.max(0, x0), ya = Math.max(0, y0);
  const xb = Math.min(stride - 1, x1), yb = Math.min(hh, y1);
  if (xb <= xa || yb <= ya) return 0;
  return s[yb * stride + xb] - s[ya * stride + xb] - s[yb * stride + xa] + s[ya * stride + xa];
}
function bevelRef(alpha, w, h, o) {
  const { thickness, outer, dir, tint, Cf, Kf } = o;
  const WTX = w, WTY = h, FX = WTX / Cf, FY = WTY / Kf;
  const offs = loopOffsetsRef(thickness);
  const out = new Uint8ClampedArray(w * h * 4);
  const mr = fr(1.7 * (tint[0] / 255)), mg = fr(1.7 * (tint[1] / 255)), mb = fr(1.7 * (tint[2] / 255));
  const maxOff = offs.length > 1 ? offs[offs.length - 1] * Math.max(WTX, WTY) : 0;
  const R = Math.ceil(maxOff) + 2;
  const stride = w + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (alpha[y * w + x] === 0 && satSumRef(o.sat, stride, h, x - R, y - R, x + R + 1, y + R + 1) === 0) continue;
    const t0x = (x + 0.5) * FX, t0y = (y + 0.5) * FY;
    let a1 = 0, a2 = 0;
    for (const of of offs) {
      a1 = fr(a1 + sampleA2Ref(alpha, w, h, t0x + of * WTX, t0y + of * WTY));
      a2 = fr(a2 + sampleA2Ref(alpha, w, h, t0x - of * WTX, t0y - of * WTY));
    }
    a1 = fr(a1 / 3); a2 = fr(a2 / 3);
    let a, gray;
    if (outer === 1) {
      a = fr(a1 + a2);
      gray = fr(fr(0.5 - fr(fr(dir * a1) / 6)) + fr(fr(dir * a2) / 6));
    } else {
      a = fr(sampleA2Ref(alpha, w, h, t0x, t0y));
      gray = fr(fr(0.5 + fr(fr(dir * a1) / 6)) - fr(fr(dir * a2) / 6));
    }
    if (a > 0.5) a = 1;
    const g = Math.round(fr(gray * a) * 255);
    out[i] = Math.min(255, Math.round(fr(mr * fr(g / 255)) * 255));
    out[i + 1] = Math.min(255, Math.round(fr(mg * fr(g / 255)) * 255));
    out[i + 2] = Math.min(255, Math.round(fr(mb * fr(g / 255)) * 255));
    out[i + 3] = Math.round(a * 255);
  }
  return out;
}
function outlineRef(rgba, w, h, o) {
  const { Cf, Kf, alpha, sat } = o;
  const FX = w / Cf, FY = h / Kf;
  const offX = 3 * (w / Cf), offY = 3 * (h / Kf);
  const angles = [];
  for (let a = fr(-Math.PI); a <= Math.PI; a = fr(a + 0.3142)) angles.push(a);
  const R = Math.ceil(offX) + 2, stride = w + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ownA = alpha[y * w + x] / 255;
    if (ownA >= 0.1) { rgba[i + 3] = 255; continue; }
    if (satSumRef(sat, stride, h, x - R, y - R, x + R + 1, y + R + 1) === 0) continue;
    const t0x = (x + 0.5) * FX, t0y = (y + 0.5) * FY;
    let maxA = 0;
    for (const ang of angles) {
      const v = sampleA2Ref(alpha, w, h, t0x - offX * Math.cos(ang), t0y - offY * Math.sin(ang));
      if (v > maxA) maxA = v;
    }
    const resA = Math.max(maxA, ownA);
    rgba[i] = Math.round(fr(fr(rgba[i] / 255) * resA) * 255);
    rgba[i + 1] = Math.round(fr(fr(rgba[i + 1] / 255) * resA) * 255);
    rgba[i + 2] = Math.round(fr(fr(rgba[i + 2] / 255) * resA) * 255);
    rgba[i + 3] = Math.round(resA * 255);
  }
}

// ── 真实数据装载 ─────────────────────────────────────────────────────────
const manPath = join(RESULTS, `alpha-${TEMPLE}.json`);
if (!existsSync(manPath)) {
  console.error(`[bevel] 缺少 ${manPath}；先跑 \`node --import tsx benchmark/dump-tree-alpha.mjs\``);
  console.error(`[bevel] 本件不做合成输入的等价性判定——r49 实测合成输入抓不到真实缺陷。`);
  process.exit(1);
}
const man = JSON.parse(readFileSync(manPath, "utf8"));
function loadLayer(idx) {
  const meta = man.layers[idx];
  const bytes = readFileSync(join(RESULTS, meta.file));
  return { alpha: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), w: meta.w, h: meta.h };
}
const L = {
  big: loadLayer(1), all: loadLayer(2), done: loadLayer(3),
};
const W = L.big.w, H = L.big.h;
const Cf = man.cf ?? 1036.8, Kf = man.kf ?? 864;

const LAYERS = [
  { key: "big", label: "big t200 outer1 dir1", thickness: 200, outer: 1, dir: 1, tint: [216, 181, 27] },
  { key: "all", label: "all t200 outer0 dir-1", thickness: 200, outer: 0, dir: -1, tint: [78, 60, 14] },
  { key: "done", label: "done t180 gold", thickness: 180, outer: 0, dir: 1, tint: [255, 214, 32] },
];

const bitsEqual = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; };
const rows = [];
let failed = false;

console.log(`\n选关树烘焙内核配对 A/B（${TEMPLE} 真实 alpha ${W}×${H}，Cf=${Cf} Kf=${Kf}，各 ${ROUNDS} 轮）`);
console.log("  stage/layer              A 参照 [区间]            B 当前 [区间]            Δ       判定");

for (const Ly of LAYERS) {
  const { alpha } = L[Ly.key];
  const satRef = buildSAT(alpha, W, H);
  const satCur = buildSAT(alpha, W, H);
  const opts = { thickness: Ly.thickness, outer: Ly.outer, dir: Ly.dir, tint: Ly.tint, Cf, Kf };
  const A = [], B = [];
  for (let r = 0; r < ROUNDS; r++) {
    let t0 = performance.now();
    const ra = bevelRef(alpha, W, H, { ...opts, sat: satRef });
    A.push(performance.now() - t0);
    t0 = performance.now();
    const rb = bevelColorMatrix(alpha, W, H, { ...opts, sat: satCur });
    B.push(performance.now() - t0);
    const d = bitsEqual(ra, rb);
    if (d >= 0) { console.error(`  ✗ 位级不一致 ${Ly.label} @${d}: ${ra[d]} vs ${rb[d]}`); failed = true; }
  }
  const sa = [...A].sort((x, y) => x - y), sb = [...B].sort((x, y) => x - y);
  const sep = sb[0] > sa[sa.length - 1] || sa[0] > sb[sb.length - 1];
  rows.push({ stage: "bevel", layer: Ly.label, aMed: med(A), aMin: sa[0], aMax: sa[sa.length - 1], bMed: med(B), bMin: sb[0], bMax: sb[sb.length - 1], pct: ((med(B) - med(A)) / med(A)) * 100, sep });
}

// outline：输入取 all 层 bevel 输出
{
  const { alpha } = L.all;
  const base = bevelColorMatrix(alpha, W, H, { thickness: 200, outer: 0, dir: -1, tint: [78, 60, 14], Cf, Kf });
  const oa = new Uint8ClampedArray(W * H);
  for (let j = 0; j < W * H; j++) oa[j] = base[j * 4 + 3];
  const sat = buildSAT(oa, W, H);
  const A = [], B = [];
  for (let r = 0; r < ROUNDS; r++) {
    const ra = new Uint8ClampedArray(base);
    let t0 = performance.now();
    outlineRef(ra, W, H, { Cf, Kf, alpha: oa, sat });
    A.push(performance.now() - t0);
    const rb = new Uint8ClampedArray(base);
    t0 = performance.now();
    outlinePass(rb, W, H, { Cf, Kf, alpha: oa, sat });
    B.push(performance.now() - t0);
    const d = bitsEqual(ra, rb);
    if (d >= 0) { console.error(`  ✗ 位级不一致 outline @${d}: ${ra[d]} vs ${rb[d]}`); failed = true; }
  }
  const sa = [...A].sort((x, y) => x - y), sb = [...B].sort((x, y) => x - y);
  const sep = sb[0] > sa[sa.length - 1] || sa[0] > sb[sb.length - 1];
  rows.push({ stage: "outline", layer: "all 20角轮廓", aMed: med(A), aMin: sa[0], aMax: sa[sa.length - 1], bMed: med(B), bMin: sb[0], bMax: sb[sb.length - 1], pct: ((med(B) - med(A)) / med(A)) * 100, sep });
}

for (const r of rows) {
  console.log(
    `  ${(r.stage + "/" + r.layer).padEnd(24)} ${String(r.aMed.toFixed(1)).padStart(7)} [${r.aMin.toFixed(1)}–${r.aMax.toFixed(1)}]`.padEnd(25) +
    ` ${String(r.bMed.toFixed(1)).padStart(7)} [${r.bMin.toFixed(1)}–${r.bMax.toFixed(1)}]`.padEnd(25) +
    ` ${(r.pct >= 0 ? "+" : "") + r.pct.toFixed(1)}%`.padStart(8) + `  ${r.sep ? "区间分离" : "带内"}`,
  );
}
const aSum = rows.reduce((a, r) => a + r.aMed, 0), bSum = rows.reduce((a, r) => a + r.bMed, 0);
console.log(`\n  合计：${aSum.toFixed(1)} → ${bSum.toFixed(1)} ms  (${(((bSum - aSum) / aSum) * 100).toFixed(1)}%)`);

if (argSave) {
  const out = join(RESULTS, `bevel-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), temple: TEMPLE, w: W, h: H, rounds: ROUNDS, bitsEqual: !failed, rows }, null, 1));
  console.log(`  快照已存 ${out}`);
}
if (failed) {
  console.error("\n[bevel] ✗ 存在位级不一致——等价性门禁失败");
  process.exit(1);
}
console.log("  ✓ 全部位级一致");

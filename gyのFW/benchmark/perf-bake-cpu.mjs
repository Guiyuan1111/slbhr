/**
 * 选关树烘焙 CPU 分阶段归因（r49 新增）。
 *
 * ## 为什么需要
 * r49 已用 `perf-bake.mjs` 打出真浏览器口径：`toBaked` ≈ 1.5–2.0s，但 CPU profile 里
 * 70.3% 是 `(program)`（headless SwiftShader 合成等待），只有约 350ms 是 JS。
 * 也就是说「烘焙慢」在无头环境里**大部分不是 CPU**。
 *
 * 但 350ms 的 CPU 在真实设备上也是真实的。这 350ms 到底花在哪一段——`alphaSat` 的
 * 前缀和 / `bevel` 的 6~7 次双线性采样 / `outline` 的 20 角采样 / `premult` 的逐像素
 * 除法——此前从没拆过。本件补上。
 *
 * ## 口径
 * 用 **真实 alpha**（`TEMP/r49-alphadump.mjs` 从页面 `getImageData` 导出，forest 三层的
 * 原始 alpha 字节）重放 `stepTreeBake` 的纯 CPU 部分。不用合成输入——r49 实测证明合成
 * 形态会把结论量反：forest 厚层覆盖率 39.8%/29.6%、93% 的行都有 alpha（稠密），
 * 只有金星层 0.58% 稀疏。
 *
 * 三个阶段以外的东西（`drawLayerContent` 的 canvas 绘制、`getImageData` 读回、
 * `putImageData` 上传）需要 DOM，不在本件范围，由 `perf-bake.mjs` 的浏览器口径覆盖。
 *
 * ⚠ 分片（`y0/y1`）在这里被拆开：本件按**整层**计时，因为要看总量。分片只影响
 *   单帧预算，不影响总工作量。
 *
 * 用法：
 *   node --import tsx benchmark/perf-bake-cpu.mjs
 *   ROUNDS=7 node --import tsx benchmark/perf-bake-cpu.mjs --save r49-bake-cpu
 *   node --import tsx benchmark/perf-bake-cpu.mjs --compare r49-bake-cpu
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bevelColorMatrix,
  buildSAT,
  outlinePass,
  premultToStraight,
} from "../packages/client/src/scenes/templeTreeBake.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const TEMPLE = process.env.TEMPLE ?? "forest";
const ROUNDS = Number(process.env.ROUNDS ?? 5);

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// 三层规格与 LAYERS 一致（templeTreeBake.ts:62）
const LAYERS = [
  { key: "big", thickness: 200, outer: 1, dir: 1, outline: false, gold: false, dumpIdx: 1 },
  { key: "all", thickness: 200, outer: 0, dir: -1, outline: true, gold: false, dumpIdx: 2 },
  { key: "done", thickness: 180, outer: 0, dir: 1, outline: false, gold: true, dumpIdx: 3 },
];
const TINT = [216, 181, 27]; // forest 的 temple.color；gold 层另用 [0xff,0xd6,0x20]
const Cf = 1036, Kf = 864; // canvasW/H = floor(C/k)，FX=FY≈1

function loadReal() {
  const manifestPath = join(RESULTS, `alpha-${TEMPLE}.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`缺少 ${manifestPath}——先跑 TEMP/r49-alphadump.mjs 导出真实 alpha`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const out = new Map();
  for (const L of LAYERS) {
    const meta = manifest.layers[L.dumpIdx];
    if (!meta) throw new Error(`manifest 缺第 ${L.dumpIdx} 层`);
    const bytes = readFileSync(join(RESULTS, meta.file));
    const alpha = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (alpha.length !== meta.w * meta.h) throw new Error(`${meta.file} 尺寸不符`);
    out.set(L.key, { alpha, w: meta.w, h: meta.h });
  }
  return out;
}

const real = loadReal();
const W = [...real.values()][0].w;
const H = [...real.values()][0].h;

/** 跑一整轮烘焙的纯 CPU 部分，返回各 stage 的毫秒数 */
function runOnce() {
  const t = {};
  const outs = {};
  const outAlphas = {};

  let t0 = performance.now();
  const alphas = {}, sats = {};
  for (const L of LAYERS) {
    const { alpha } = real.get(L.key);
    alphas[L.key] = alpha;
    sats[L.key] = buildSAT(alpha, W, H);
  }
  // alphaSat 分片在真实现里是「从 raw RGBA 提 alpha + 复刻 SAT 递推」，两者都要计
  for (const L of LAYERS) {
    const a = alphas[L.key];
    const w = W, stride = w + 1;
    const sat = sats[L.key];
    for (let y = 0; y < H; y++) {
      let rowSum = 0;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const v = a[row + x];
        rowSum += v;
        sat[(y + 1) * stride + (x + 1)] = sat[y * stride + (x + 1)] + rowSum;
      }
    }
  }
  t.alphaSat = performance.now() - t0;

  t0 = performance.now();
  for (const L of LAYERS) {
    const tint = L.gold ? [0xff, 0xd6, 0x20] : TINT;
    outs[L.key] = bevelColorMatrix(alphas[L.key], W, H, {
      thickness: L.thickness, outer: L.outer, dir: L.dir, tint,
      Cf, Kf, sat: sats[L.key],
    });
  }
  t.bevel = performance.now() - t0;

  t0 = performance.now();
  const allLayer = LAYERS.find((L) => L.outline);
  const n = W * H;
  const oa = new Uint8ClampedArray(n);
  const o = outs[allLayer.key];
  for (let j = 0; j < n; j++) oa[j] = o[j * 4 + 3];
  const outSat = buildSAT(oa, W, H);
  t.satOut = performance.now() - t0;

  t0 = performance.now();
  outlinePass(outs[allLayer.key], W, H, { Cf, Kf, alpha: oa, sat: outSat });
  t.outline = performance.now() - t0;

  t0 = performance.now();
  for (const L of LAYERS) premultToStraight(outs[L.key]);
  t.premult = performance.now() - t0;

  t.total = LAYERS.reduce((a, L) => 0, 0) +
    t.alphaSat + t.bevel + t.satOut + t.outline + t.premult;
  return { t, outs };
}

// 预热一次（JIT + 让 GC 先跑一轮），不计入
runOnce();

const runs = [];
for (let r = 0; r < ROUNDS; r++) runs.push(runOnce().t);

const STAGES = [
  ["alphaSat", "alphaSat（提 alpha + SAT 递推，×3）"],
  ["bevel", "bevelColorMatrix（三层，双线性采样）"],
  ["satOut", "satOut（all 层输出 alpha 的 SAT）"],
  ["outline", "outlinePass（all 层 20 角轮廓）"],
  ["premult", "premultToStraight（×3，逐像素除法）"],
];

const summary = STAGES.map(([k, label]) => {
  const vals = runs.map((r) => r[k]);
  return { key: k, label, med: +med(vals).toFixed(2), min: +Math.min(...vals).toFixed(2), max: +Math.max(...vals).toFixed(2) };
});
const totalMed = med(runs.map((r) => r.total));

console.log(`\n选关树烘焙 CPU 分阶段（${TEMPLE} 真实 alpha ${W}×${H}，${ROUNDS} 轮，Node）`);
for (const s of summary) {
  console.log(`  ${s.label.padEnd(42)} 中位 ${String(s.med).padStart(7)} ms  [${s.min}–${s.max}]  ${((s.med / totalMed) * 100).toFixed(1).padStart(5)}%`);
}
const accounted = summary.reduce((a, s) => a + s.med, 0);
console.log(`  ${"合计".padEnd(42)} 中位 ${String(totalMed.toFixed(2)).padStart(7)} ms  （分段和 ${accounted.toFixed(2)}）`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `bake-cpu-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), temple: TEMPLE, w: W, h: H, rounds: ROUNDS, summary, runs }, null, 1));
  console.log(`\n快照已存 ${out}`);
}
if (argCompare) {
  const f = join(RESULTS, `bake-cpu-${argCompare}.json`);
  if (!existsSync(f)) console.error("[bake-cpu] 对比基线不存在:", f);
  else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    console.log(`\n对比 ${argCompare}（中位，ms）：`);
    for (const s of summary) {
      const prev = base.summary.find((x) => x.key === s.key);
      if (!prev) continue;
      const d = ((s.med - prev.med) / prev.med) * 100;
      console.log(`  ${s.key.padEnd(12)} ${String(prev.med).padStart(8)} → ${String(s.med).padStart(8)}  ${(d >= 0 ? "+" : "") + d.toFixed(1)}%`);
    }
    const dt = ((totalMed - med(base.runs.map((r) => r.total))) / med(base.runs.map((r) => r.total))) * 100;
    console.log(`  ${"total".padEnd(12)} ${String(med(base.runs.map((r) => r.total))).padStart(8)} → ${String(totalMed.toFixed(2)).padStart(8)}  ${(dt >= 0 ? "+" : "") + dt.toFixed(1)}%`);
  }
}

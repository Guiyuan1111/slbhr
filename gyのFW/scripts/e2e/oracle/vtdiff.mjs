#!/usr/bin/env node
/**
 * vtoracle·vtdiff：forest_01 最小差分对——内核（固定 dt=1/60）vs oracle（虚拟钟 60Hz，dt=整数 ms 序列）。
 *
 * 用法：node --import tsx scripts/e2e/oracle/vtdiff.mjs [--oracle <run json>] [--out <dir>]
 * 内核侧：routetool/kernel.mjs 同一份 makeWorld/expandFlat 跑路线（只读复用）；
 * oracle 侧：vtrun.mjs 产出的逐帧状态流（scripts/e2e/out/oracle-vt/vt-forest_01-run*.json）。
 * 输出：首个发散帧 + 双方该帧 (x,y,vx,vy)；发散前逐帧差值摘要；结局对照。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runKernel, makeWorld, expandFlat, loadLevelDoc } from "../routetool/kernel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const E2E = resolve(HERE, "..");
const log = (m) => console.log(`[vtdiff] ${m}`);

function argVal(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const oraclePath = resolve(argVal("--oracle", join(E2E, "out/oracle-vt/vt-forest_01-run1.json")));
const outDir = resolve(E2E, argVal("--out", "out/oracle-vt"));
mkdirSync(outDir, { recursive: true });

// ── oracle 侧 ─────────────────────────────────────────────────
const orc = JSON.parse(readFileSync(oraclePath, "utf8"));
const level = orc.tag.replace(/\.json$/, "").includes("_") ? orc.tag.split("-")[0] : "forest_01";
log(`oracle: ${oraclePath} samples=${orc.samples.length} marks=${JSON.stringify(orc.marks)}`);

// ── 内核侧：同路线逐帧 trace（runKernel 的 trace 口径：f、fb[x,y]、wg[x,y]）──────────
const routeDoc = JSON.parse(readFileSync(join(E2E, "inputs/routes/forest_01.json"), "utf8"));
const total = routeDoc.totalFrames;
const ins = expandFlat(routeDoc.fb, routeDoc.wg, total);
const w = makeWorld("forest_01");
const kernel = [];
for (let f = 0; f < total; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const fb = w.snapshotPlayer("fireboy");
  const wg = w.snapshotPlayer("watergirl");
  kernel.push({ f, fb: [fb.x, fb.y, fb.vx, fb.vy], wg: [wg.x, wg.y, wg.vx, wg.vy], ph: w.phase });
  if (w.phase !== "playing") { log(`内核相位结束 @f${f}: ${w.phase}`); break; }
}
log(`kernel: frames=${kernel.length} 终相=${kernel.at(-1).ph}`);

// ── 逐帧比对（x,y,vx,vy 全量；oracle wg/fb 数组 [x,y,vx,vy]）──────────────────
// oracle sample[k] 与 kernel trace[k] 同为第 k+1 次 tick 后状态（帧 0 输入对齐，见 lib.mjs runScript 注）
const n = Math.min(kernel.length, orc.samples.length);
let firstDiff = -1;
let firstDiffDetail = null;
const preDiffs = []; // 发散前的 |Δ| 记录（逐帧 max 分量）
for (let k = 0; k < n; k++) {
  const kf = kernel[k];
  const os = orc.samples[k];
  const d = (a, b) => Math.abs(a - b);
  const comp = { fb: [], wg: [] };
  let mx = 0;
  for (const role of ["fb", "wg"]) {
    for (let c = 0; c < 4; c++) {
      const dd = d(kf[role][c], os[role]?.[c] ?? NaN);
      comp[role].push(dd);
      if (Number.isFinite(dd)) mx = Math.max(mx, dd);
    }
  }
  if (mx > 0 && firstDiff === -1) {
    firstDiff = k;
    firstDiffDetail = { kernel: kf, oracle: { s: os.s, n: os.n, e: os.e, fb: os.fb, wg: os.wg }, comp };
  }
  if (firstDiff === -1) preDiffs.push({ f: k, mx });
}
log(`首个发散帧（任一分量 |Δ|>0）：f=${firstDiff}`);
if (firstDiffDetail) {
  const { kernel: kf, oracle: os, comp } = firstDiffDetail;
  log(`  内核  f${kf.f}: fb=(${kf.fb.map((v) => v.toFixed(4)).join(", ")}) wg=(${kf.wg.map((v) => v.toFixed(4)).join(", ")})`);
  log(`  oracle f${firstDiff}: fb=(${os.fb.map((v) => v.toFixed(4)).join(", ")}) wg=(${os.wg.map((v) => v.toFixed(4)).join(", ")}) n=${os.n} e=${os.e}`);
  log(`  |Δ| fb=[${comp.fb.map((v) => v.toExponential(3)).join(", ")}] wg=[${comp.wg.map((v) => v.toExponential(3)).join(", ")}]（顺序 x,y,vx,vy）`);
}

// 发散后增长曲线：每 50 帧取 |Δx| |Δy| 最大分量（至任一侧结束）
const curve = [];
for (let k = Math.max(firstDiff, 0); k < n; k += 50) {
  const kf = kernel[k];
  const os = orc.samples[k];
  const mx = Math.max(
    ...["fb", "wg"].flatMap((r) => [0, 1, 2, 3].map((c) => Math.abs((kf[r]?.[c] ?? 0) - (os[r]?.[c] ?? 0)))),
  );
  curve.push({ f: k, maxAbsDelta: +mx.toFixed(3), kernelPos: [kf.fb[0], kf.fb[1]], oraclePos: [os.fb[0], os.fb[1]] });
}
log("发散增长曲线（每 50 帧 max|Δ| 全分量）：");
for (const c of curve) log(`  f${String(c.f).padStart(4)} max|Δ|=${String(c.maxAbsDelta).padStart(8)} kernel.fb=(${c.kernelPos.map((v) => v.toFixed(0))}) oracle.fb=(${c.oraclePos.map((v) => v.toFixed(0))})`);

// ── 结局对照 ──────────────────────────────────────────────────
const kEnd = kernel.at(-1);
const summary = {
  level: "forest_01",
  kernel: { frames: kernel.length, phase: kEnd.ph, winF: kernel.findIndex((t) => t.ph === "won") },
  oracle: { samples: orc.samples.length, marks: orc.marks, frames: orc.frames },
  firstDiffFrame: firstDiff,
  firstDiffDetail,
  curve,
  preDiffMax: preDiffs.length ? Math.max(...preDiffs.map((p) => p.mx)) : 0,
};
writeFileSync(join(outDir, "vtdiff-forest_01.json"), JSON.stringify(summary, null, 1));
log(`summary → ${join(outDir, "vtdiff-forest_01.json")}`);

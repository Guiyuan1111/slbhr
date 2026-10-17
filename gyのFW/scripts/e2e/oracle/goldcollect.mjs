#!/usr/bin/env node
/**
 * vtoracle·goldcollect：oracle 金输出采集 + 内核「同 dt 整数 ms 序列」回放比对器。
 *
 * 定位（note/research/2026-10-behavior-parity/05-synthesis.md §4 行动清单第 2 项，
 * 04-fixtures.md §5 oracle 接入预案的 tolerance 定值流程）：
 *   STEP1 采集（--capture）：虚拟钟 oracle 跑一条路线，逐帧记录 elapsed（整数 ms 域）
 *          与双角色状态流 {s,n,e,fb:[x,y,vx,vy],wg:[...]}；dt 序列不假设模式，只实录，
 *          ×N 互证序列稳定性。
 *   STEP2 比对（--compare）：内核按实录 dt 序列回放同一路线——dt_k = sample[k].e / 1000，
 *          与 oracle world.Step(min(0.04, elapsed/1000)) 同一浮点算式（e=16.666…钳制帧
 *          亦同域）——逐帧逐分量比对，判逐位是否成立；不成立则给出首发散帧/残差分布
 *          （中位/峰/接触面收敛）/win 帧对齐，作为 oracle 金 fixture 的 tolerance 定值依据。
 *
 * 用法：
 *   node scripts/e2e/oracle/goldcollect.mjs --capture --route forest_01 --runs 2 [--frames 300]
 *   node scripts/e2e/oracle/goldcollect.mjs --compare --gold TEMP/goldfix/gold-forest_01-r1.json
 *
 * 只读 import：oracle/lib.mjs（伺服/假钟/进关/采样/注入，runScript 三段式起跑原样复用）、
 * routetool/kernel.mjs（makeWorld/expandFlat）。本文件不修改任何既有模块；
 * 产物写 TEMP/goldfix/（gitignored，收尾清理）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runScript, expandInputs, serveOracle, ORACLE_ROOT } from "./lib.mjs";
import { makeWorld, expandFlat } from "../routetool/kernel.mjs";

const log = (m) => console.log(`[goldcollect] ${m}`);

function argVal(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const hasFlag = (flag) => process.argv.includes(flag);

const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = join(E2E, "inputs/routes");
const OUT_DIR = resolve(argVal("--out", "TEMP/goldfix"));

// ────────────────────────────────────────────── STEP1：oracle 金输出采集

if (hasFlag("--capture")) {
  const routeName = argVal("--route", "forest_01");
  const runs = Number(argVal("--runs", "2"));
  const capFrames = hasFlag("--frames") ? Number(argVal("--frames", "0")) : 0;
  const routePath = routeName.includes("/") ? resolve(routeName) : join(ROUTES_DIR, `${routeName}.json`);
  const routeDoc = JSON.parse(readFileSync(routePath, "utf8"));
  const totalFrames = capFrames > 0 ? Math.min(capFrames, routeDoc.totalFrames) : routeDoc.totalFrames;
  const levelFile = `${routeDoc.level.startsWith("forest_01") ? "tutorials/levels" : "forest/levels"}/${routeDoc.level}.json`;
  // 关卡 id 从 oracle temple.json 解析（enterLevel 以 (id, filename) 检索；id 错会经 ?? find(id)
  // 兜底静默载入错误关卡——vtrun 只跑过 forest_01（id=1）故未暴露，此处按 filename 精确匹配）
  const temple = JSON.parse(readFileSync(join(ORACLE_ROOT, "data", "forest", "temple.json"), "utf8"));
  const levelId = temple.levels.find((l) => l.filename === levelFile)?.id;
  if (!levelId) throw new Error(`temple.json 无 ${levelFile} 条目，无法定位关卡 id`);
  const ins = expandInputs(routeDoc.fb ?? [], routeDoc.wg ?? [], totalFrames);
  mkdirSync(OUT_DIR, { recursive: true });
  log(`capture ${routeName} level=${routeDoc.level} 帧数=${totalFrames} runs=${runs} → ${OUT_DIR}`);

  const server = await serveOracle();
  log(`伺服 ${server.base}`);
  try {
    const results = [];
    for (let k = 1; k <= runs; k++) {
      const chunks = [];
      const r = await runScript({
        serverBase: server.base,
        levelId,
        levelFile,
        totalFrames,
        fbIns: ins.fb,
        wgIns: ins.wg,
        onFrame: (f, chunk) => {
          chunks.push(...chunk);
          if ((f + 1) % 1000 === 0) log(`run${k}: 帧 ${f + 1}/${totalFrames} 采样 ${chunks.length}`);
        },
      });
      const rec = {
        kind: "oracle-gold", route: routeName, level: routeDoc.level, run: k,
        totalFrames, frames: r.frames, ended: r.ended, marks: r.marks, wallMs: r.wallMs,
        samples: chunks,
      };
      const file = join(OUT_DIR, `gold-${routeName}-r${k}.json`);
      writeFileSync(file, JSON.stringify(rec));
      const last = chunks.at(-1);
      log(`run${k}: ended=${r.ended} marks=${JSON.stringify(r.marks)} 采样=${chunks.length} 末样本 wg=(${last?.wg?.[0]?.toFixed(1)},${last?.wg?.[1]?.toFixed(1)}) fb=(${last?.fb?.[0]?.toFixed(1)},${last?.fb?.[1]?.toFixed(1)}) wall=${r.wallMs}ms → ${file}`);
      results.push(rec);
    }

    // dt 序列取证：实录比对 + 解析式对照（不假设模式，只验证）
    const S = 1000 / 60;
    const eAna = (k) => Math.floor((k + 1) * S) - Math.floor(k * S); // 样本 k = arm 后第 k+1 帧
    const forensics = results.map((rec) => {
      const es = rec.samples.map((s) => s.e);
      const nDiffOk = es.every((e, k) => k === 0 || rec.samples[k].n - rec.samples[k - 1].n === e);
      const ana = es.map((e, k) => (k === 0 ? null : e === eAna(k))).filter((v) => v !== null);
      const cycle3 = es.slice(3).every((e, i) => e === es[i]);
      const uniq = [...new Set(es.slice(1))].sort((a, b) => a - b);
      return {
        samples: rec.samples.length,
        eHead: es.slice(0, 8),
        e0IsClamp: es[0] === S,
        nMinusPrevEqualsE: nDiffOk,
        matchesFloorFormula: `${ana.filter(Boolean).length}/${ana.length}`,
        period3Hold: cycle3,
        eValuesBeyondHead: uniq,
      };
    });
    let identical = "n/a";
    if (results.length >= 2) {
      const c0 = JSON.stringify(results[0].samples);
      identical = results.slice(1).every((r) => JSON.stringify(r.samples) === c0) ? "BITEXACT" : "DIVERGED";
    }
    log("dt 序列取证：");
    for (const [i, f] of forensics.entries()) log(`  run${i + 1}: ${JSON.stringify(f)}`);
    log(`×${results.length} 采样流逐位：${identical}`);
    writeFileSync(join(OUT_DIR, `gold-${routeName}-forensics.json`), JSON.stringify({ route: routeName, runs, identical, forensics }, null, 1));
  } finally {
    await server.close();
  }
  process.exit(0);
}

// ────────────────────────────────────────────── STEP2：内核同 dt 序列回放比对

if (hasFlag("--compare")) {
  const goldPath = resolve(argVal("--gold", ""));
  const gold = JSON.parse(readFileSync(goldPath, "utf8"));
  const routeDoc = JSON.parse(readFileSync(join(ROUTES_DIR, `${gold.route}.json`), "utf8"));
  const samples = gold.samples;
  // dt 序列：实录 e → 秒（与 oracle world.Step(min(0.04, elapsed/1000)) 同一浮点算式）
  const dtSeq = samples.map((s) => s.e / 1000);
  log(`compare ${gold.route} level=${gold.level} oracle 采样=${samples.length} marks=${JSON.stringify(gold.marks)}`);
  log(`dt 序列头：${dtSeq.slice(0, 6).map((d) => d.toFixed(6)).join(", ")} …（e0 钳制帧=${samples[0].e === 1000 / 60}）`);

  const ins = expandFlat(routeDoc.fb, routeDoc.wg, routeDoc.totalFrames);
  const w = makeWorld(gold.level);
  const devs = []; // 每帧 max 分量 |Δ|
  const NAMES = ["fb.x", "fb.y", "fb.vx", "fb.vy", "wg.x", "wg.y", "wg.vx", "wg.vy"];
  let firstDiff = -1, firstDiffDetail = null;
  let bitExact = true;
  const kernelEvents = [];
  let kernelEnd = null;

  for (let k = 0; k < samples.length; k++) {
    const os = samples[k];
    const evs = w.step(dtSeq[k], { fireboy: ins.fb[k], watergirl: ins.wg[k] });
    for (const e of evs) kernelEvents.push({ f: k, type: e.type });
    const fb = w.snapshotPlayer("fireboy");
    const wg = w.snapshotPlayer("watergirl");
    const d = [fb.x - os.fb[0], fb.y - os.fb[1], fb.vx - os.fb[2], fb.vy - os.fb[3], wg.x - os.wg[0], wg.y - os.wg[1], wg.vx - os.wg[2], wg.vy - os.wg[3]];
    const mx = Math.max(...d.map(Math.abs));
    devs.push(mx);
    if (mx !== 0) bitExact = false;
    if (mx > 0 && firstDiff === -1) {
      firstDiff = k;
      firstDiffDetail = {
        kernel: { fb: [fb.x, fb.y, fb.vx, fb.vy], wg: [wg.x, wg.y, wg.vx, wg.vy], ph: w.phase },
        oracle: { s: os.s, n: os.n, e: os.e, fb: os.fb, wg: os.wg },
        comp: Object.fromEntries(NAMES.map((n, i) => [n, d[i]])),
      };
    }
    if (fb.dying || fb.dead || wg.dying || wg.dead) { kernelEnd = { status: "dead", frame: k }; break; }
    if (w.phase === "won") { kernelEnd = { status: "won", frame: k }; break; }
  }
  if (!kernelEnd) kernelEnd = { status: "samples-exhausted", frame: devs.length - 1 };

  // 残差统计
  const sorted = [...devs].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const maxDev = sorted.at(-1);
  const maxAt = devs.indexOf(maxDev);
  const nonzero = devs.filter((d) => d > 0);
  // 接触面收敛观察：超 0.1px 后又回到 ≤0.02px 的往返次数
  let excursions = 0, inExcursion = false, reconverged = 0;
  for (const d of devs) {
    if (!inExcursion && d > 0.1) { inExcursion = true; excursions++; }
    else if (inExcursion && d <= 0.02) { inExcursion = false; reconverged++; }
  }
  // 每 50 帧桶曲线
  const q50 = (seg) => { const s = [...seg].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const curve = [];
  for (let k = 0; k < devs.length; k += 50) {
    const seg = devs.slice(k, k + 50);
    curve.push({ f0: k, max: +Math.max(...seg).toFixed(4), median: +q50(seg).toFixed(4) });
  }

  const evByType = {};
  for (const e of kernelEvents) evByType[e.type] = (evByType[e.type] ?? 0) + 1;

  const summary = {
    gold: goldPath,
    oracle: { samples: samples.length, marks: gold.marks, ended: gold.ended },
    kernel: { end: kernelEnd, events: kernelEvents.length, eventsByType: evByType, firstEventF: kernelEvents[0]?.f ?? null },
    winAlign: { oracleWinF: gold.marks?.win ?? null, kernelWinF: kernelEnd.status === "won" ? kernelEnd.frame : null },
    bitExact,
    firstDiff,
    firstDiffDetail,
    residual: {
      framesCompared: devs.length,
      zeroFrames: devs.length - nonzero.length,
      median: +q(0.5).toFixed(6), p90: +q(0.9).toFixed(4), p99: +q(0.99).toFixed(4),
      maxDev: +maxDev.toFixed(6), maxAt,
      excursionsOver01px: excursions, reconvergedTo002px: reconverged,
    },
    curve,
  };
  log(`内核终态=${kernelEnd.status}@f${kernelEnd.frame} vs oracle marks=${JSON.stringify(gold.marks)}`);
  log(`逐位=${bitExact ? "是" : "否"} 首发散=${firstDiff} 零偏差帧=${devs.length - nonzero.length}/${devs.length}`);
  log(`残差：中位 ${q(0.5).toPrecision(3)} p90 ${q(0.9).toFixed(4)} p99 ${q(0.99).toFixed(4)} max ${maxDev.toPrecision(6)}@f${maxAt}`);
  log(`发作/收敛：>0.1px 发作 ${excursions} 次，其中回收到 ≤0.02px ${reconverged} 次`);
  log(`内核事件流：${kernelEvents.length} 个（${JSON.stringify(evByType)}）首帧 f${kernelEvents[0]?.f ?? "-"}`);
  writeFileSync(goldPath.replace(/\.json$/, "-cmp.json"), JSON.stringify(summary, null, 1));
  log(`summary → ${goldPath.replace(/\.json$/, "-cmp.json")}`);
  process.exit(0);
}

// ────────────────────────────────────────────── STEP3：fixture 落盘（route + dtschedule + expected）

/**
 * --build-fixture：把一份 oracle 金采集写成 fixture case 的机写三件（route.json 逐字节拷贝、
 * dtschedule.json 实录 dt 序列、expected.json 金输出帧流）。meta.json 人写，不在此生成。
 * 帧流取 0..win 帧闭区间；ph 映射 level→playing / endGame→won（oracle 状态名 → 内核 phase 口径）；
 * ev 恒 []（oracle 侧采不到内核 WorldEvent，比对经 meta.compareEvents=false 跳过）。
 * routeSig 与 fixture-runner 同式（规范化事件流 sha256 前 16 hex）。
 */
if (hasFlag("--build-fixture")) {
  const goldPath = resolve(argVal("--gold", ""));
  const dir = resolve(argVal("--dir", ""));
  if (!dir) throw new Error("--build-fixture 需要 --dir <fixture case 目录>");
  const gold = JSON.parse(readFileSync(goldPath, "utf8"));
  const routeBuf = readFileSync(join(ROUTES_DIR, `${gold.route}.json`));
  const routeDoc = JSON.parse(routeBuf, "utf8");
  const canon = JSON.stringify({ level: routeDoc.level, tickHz: routeDoc.tickHz, totalFrames: routeDoc.totalFrames, fb: routeDoc.fb, wg: routeDoc.wg });
  const routeSig = createHash("sha256").update(canon).digest("hex").slice(0, 16);
  const winF = gold.marks?.win;
  if (winF == null) throw new Error("gold 采集无 win mark——--build-fixture 只支持通关金输出");
  const mapPh = (s) => (s === "level" ? "playing" : s === "endGame" ? "won" : s);
  const frames = gold.samples.slice(0, winF + 1).map((s, f) => ({
    f, ph: mapPh(s.s),
    fb: { x: s.fb[0], y: s.fb[1], vx: s.fb[2], vy: s.fb[3] },
    wg: { x: s.wg[0], y: s.wg[1], vx: s.wg[2], vy: s.wg[3] },
    ev: [],
  }));
  const expected = {
    format: 1, level: gold.level, case: dir.split(/[\\/]/).at(-1),
    source: "oracle", dtSchedule: "ms-quantized-rec",
    tolerance: Number(argVal("--tolerance", "0")),
    sampleEvery: 1, mechEvery: 0,
    compareEvents: false, compareVelocities: false, comparePhase: false,
    outcomeWindowF: Number(argVal("--outcome-window", "0")),
    totalFrames: routeDoc.totalFrames, routeSig,
    outcome: { status: "won", frame: winF },
    frames,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "route.json"), routeBuf);
  writeFileSync(
    join(dir, "dtschedule.json"),
    JSON.stringify({
      format: 1, unit: "ms", level: gold.level,
      note: "虚拟钟 oracle 实录 elapsed 序列（首元素=arm 跳变钳制帧 1000/60，其后整数 ms；采集 ×2 BITEXACT，解析式 floor((k+1)·1000/60)−floor(k·1000/60) 全吻合）。采集器 scripts/e2e/oracle/goldcollect.mjs --capture。消费方 fixture-runner dtSchedule=ms-quantized-rec：dt=值/1000，与 oracle world.Step(min(0.04, elapsed/1000)) 同算式。",
      dt: gold.samples.map((s) => s.e),
    }),
  );
  writeFileSync(join(dir, "expected.json"), JSON.stringify(expected, null, 2) + "\n");
  log(`fixture 机写三件 → ${dir}`);
  log(`  route.json（逐字节拷贝）+ dtschedule.json（${gold.samples.length} 帧序列）+ expected.json（${frames.length} 帧，won@f${winF}，routeSig=${routeSig}）`);
  log("  meta.json 须人写核对（tolerance/outcomeWindowF 与 --tolerance/--outcome-window 一致）");
  process.exit(0);
}

console.log("用法：goldcollect.mjs --capture --route <名> [--runs N] [--frames N] [--out DIR]");
console.log("      goldcollect.mjs --compare --gold <gold json>");
process.exit(1);

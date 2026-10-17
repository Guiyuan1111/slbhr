#!/usr/bin/env node
/**
 * vtoracle·windphase：风 sin 相位对拍探针（05 号档行动清单第 3 项，02 号档 §5.3 诚实差距之首）。
 *
 * 问题（07 号档 §2 表 #8，唯一未同构项）：oracle 风推力 = f·(1.2+0.2·sin(game.time.now/1000))，
 * now 的时钟域 vs 内核 windClockS()（缺省 simTimeS=Σdt；world.ts:247 applyForce 在 :270 simTimeS+=dt
 * 【之前】读取——读的是 dt 区间左端点）。
 *
 * STEP1 时钟源裁定（引文全录 note/research/2026-10-behavior-parity/09-wind-phase.md §1）：
 *   - Wind 模块件 L134（=beautified L59564）：Math.sin(this.game.time.now / 1000)
 *   - Game.update（beautified L14653-14654）：update: function (a) { this.time.update(a); …——帧顶刷新
 *   - Time.prototype.update（L25938-25943）：this.now = a（a=Game.update 入参 rAF ts）；elapsed=now−prevNow
 *   - RequestAnimationFrame.updateRAF（L24247）：this.game.update(Math.floor(a))——整数 ms 域
 *   - ⇒ now=本帧 rAF 时间戳取整；帧顶刷新 ⇒ 帧内 stage/device 更新读到本帧值（区间右端点）。
 *     假钟下 ts=frame·(1000/60)（lib.mjs VT_INIT），原点=最后一次 __vt.arm（帧号归零，时刻可控）。
 *
 * 本探针（STEP2）：
 *   oracle：虚拟钟跑路线，采样器逐帧记 {n=time.now, e=time.elapsed}（attachSampler 原样）；另布被动探针——
 *           ① 每个 wind 设备（MechManager.deviceGroups 过滤 windSensor）update 前记"施力 tick 读点"{n,e,a}；
 *           ② 双角色 body.ApplyForce 记力矢量+体/柱位置（端到端验证力公式确实读该帧 n）。
 *   内核：  makeWorld(level) 同路线口径回放，逐步记 applyForce 收到的 nowS（=步前 world.simSeconds，
 *           由 world.ts:247→270 次序保证）：
 *     P1 fixed 1/60（det/fixture 口径）；P2 实录 dtSeq=e/1000（oracle-gold fixture 口径，goldcollect 同式）；
 *     P3 = P2 + windClockS 相位锚定 +median(Δ2)（WorldOptions.windClockS，world.ts:63-69）——
 *         与 P2 唯一差异是风相位，轨迹残差 P3 vs P2 = 风相位对轨迹的净贡献（可公度性判据）。
 *   相位差谱：Δ(k)=n_k/1000 − nowS_k（sin 自变量域，秒）；量化下界 Q=1ms（oracle 整数 ms floor 摆幅 [0,1)ms）。
 *   判定：max|Δ−median(Δ)|≤Q 且 |median(Δ)|≤Q → 对齐；残差≤Q 而 |median|>Q → 恒定偏移（可锚定修正）；
 *         否则 → 结构性错位（公式级差异）。
 *
 * 用法：node scripts/e2e/oracle/windphase.mjs --probe [--route forest_26] [--frames N] [--out TEMP/windphase]
 *
 * 只读 import：oracle/lib.mjs（伺服/假钟/进关/采样/注入）；routetool/kernel.mjs（makeWorld/expandFlat/
 * locateLevel/makeProvider）；packages/shared kernel/world.ts+level2.ts（与 kernel.mjs 同法直载，只读）。
 * 运行序镜像 lib.mjs runScript（三段式起跑逐行同序），仅在其 enterLevel 与二次 arm 之间插入探针布防
 * （被动记录器，不触物理/时钟）。产物写 TEMP/windphase/（gitignored，收尾清理）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serveOracle, openOracle, enterLevel, attachSampler, expandInputs, injectFrame, releaseAll, ORACLE_ROOT } from "./lib.mjs";
import { makeWorld, expandFlat, locateLevel, makeProvider } from "../routetool/kernel.mjs";
import { ROOT } from "../lib.mjs";

// P3 锚定口径需带 windClockS 构造 World（WorldOptions，world.ts:63-69）——与 kernel.mjs 同法直载 TS 源（只读）
const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "level2.ts")).href);
const { World } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "world.ts")).href);
const makeWorldOpt = (level, options) => {
  const { dir, doc } = locateLevel(level);
  return new World(parseLevel(level, doc, makeProvider(dir)), options);
};

const log = (m) => console.log(`[windphase] ${m}`);

function argVal(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const hasFlag = (flag) => process.argv.includes(flag);

const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = join(E2E, "inputs/routes");
const OUT_DIR = resolve(argVal("--out", "TEMP/windphase"));

if (!hasFlag("--probe")) {
  console.log("用法：windphase.mjs --probe [--route forest_26] [--frames N] [--out DIR]");
  process.exit(1);
}

// ────────────────────────────────────────────── 页内探针布防（被动记录，不触物理/时钟）
const PROBE_INSTALL = String.raw`
(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const rec = { ticks: [], forces: [], cur: null };
  window.__wp = rec;
  // ① wind 设备施力 tick 读点：update 前挂 cur（供 ApplyForce 归属与 dist 计算），update 后清
  const groups = (g.MechManager && g.MechManager.deviceGroups) || {};
  let nWind = 0;
  for (const k in groups) for (const d of groups[k]) {
    if (!d.windSensor) continue;
    nWind++;
    const ou = d.update.bind(d);
    d.update = function () {
      let cur = null;
      try {
        const a = Object.keys(d.activeBodies ?? {}).length;
        if (a > 0 && d.state === 1) {
          const pos = d.body.data.GetPosition();
          cur = { px: pos.x, py: pos.y, len: d.options.properties.length };
          rec.cur = cur;
          rec.ticks.push({ n: g.time.now, e: g.time.elapsed, a });
        }
      } catch (e) { rec.ticks.push({ err: String(e).slice(0, 80) }); }
      const r = ou();
      try { if (rec.cur === cur) rec.cur = null; } catch (e) {}
      return r;
    };
  }
  // ② 双角色 ApplyForce 取证（box2d float64；|F| = (1.2+0.2 sin(n/1000))·100·(1−dist/len)，07 号档 §1）
  for (const p of [lv.pers1, lv.pers2]) {
    const b = p.body.data;
    const orig = b.ApplyForce.bind(b);
    b.ApplyForce = (f, ctr) => {
      try {
        if (rec.cur) {
          const bp = b.GetPosition();
          rec.forces.push({ n: g.time.now, fx: f.x, fy: f.y, bx: bp.x, by: bp.y, wx: rec.cur.px, wy: rec.cur.py, len: rec.cur.len });
        }
      } catch (e) {}
      return orig(f, ctr);
    };
  }
  return { nWind, now: g.time.now };
})()`;

// ────────────────────────────────────────────── oracle 跑（镜像 lib.runScript + 探针布防）

const drainProbe = (page) => page.evaluate(() => ({ ticks: window.__wp.ticks, forces: window.__wp.forces }));

async function probeOracleRun({ serverBase, levelId, levelFile, totalFrames, fbIns, wgIns, drainEvery = 500, settleFrames = 30 }) {
  const { browser, page } = await openOracle(serverBase);
  const cur = { fb: { up: false, left: false, right: false }, wg: { up: false, left: false, right: false } };
  try {
    await enterLevel(page, levelId, levelFile);
    const probeInfo = await page.evaluate(PROBE_INSTALL);
    log(`探针布防：wind 设备×${probeInfo.nWind}（布防时 now=${probeInfo.now}）`);
    // ↓ 与 lib.mjs runScript 三段式起跑逐行同序：二次 arm → release → settle → 三次 arm → 采样
    await page.evaluate(() => {
      window.__vt.arm(1700000000000);
      window.__vtRelease();
    });
    await page.evaluate((n) => window.__vt.step(n), settleFrames);
    await page.evaluate(() => window.__vt.arm(1700000000000));
    const sampler = await attachSampler(page);
    const chunks = [];
    for (let f = 0; f < totalFrames; f++) {
      await injectFrame(page, cur, fbIns[f], wgIns[f]);
      const errs = await page.evaluate(() => window.__vt.step(1));
      if (errs.length) throw new Error(`帧 ${f} 页内异常: ${errs[0]}`);
      if ((f + 1) % drainEvery === 0 || f === totalFrames - 1) {
        const chunk = await sampler.drain();
        chunks.push(...chunk);
      }
      const marks = f % 50 === 49 ? await sampler.readMarks() : null;
      if (marks && (marks.win !== undefined || marks.lose !== undefined)) {
        await releaseAll(page, cur);
        chunks.push(...(await sampler.drain()));
        return { ended: true, marks, frames: f + 1, samples: chunks, probe: await drainProbe(page) };
      }
    }
    await releaseAll(page, cur);
    const marks = await sampler.readMarks();
    return { ended: false, marks, frames: totalFrames, samples: chunks, probe: await drainProbe(page) };
  } finally {
    await browser.close().catch(() => {});
  }
}

// ────────────────────────────────────────────── 主流程

const routeName = argVal("--route", "forest_26");
const routePath = routeName.includes("/") ? resolve(routeName) : join(ROUTES_DIR, `${routeName}.json`);
const routeDoc = JSON.parse(readFileSync(routePath, "utf8"));
const levelFile = `${routeDoc.level.startsWith("forest_01") ? "tutorials/levels" : "forest/levels"}/${routeDoc.level}.json`;
const temple = JSON.parse(readFileSync(join(ORACLE_ROOT, "data", "forest", "temple.json"), "utf8"));
const levelId = temple.levels.find((l) => l.filename === levelFile)?.id;
if (!levelId) throw new Error(`temple.json 无 ${levelFile} 条目，无法定位关卡 id`);

const capFrames = Number(argVal("--frames", "0"));
const totalFrames = capFrames > 0 ? Math.min(capFrames, routeDoc.totalFrames) : routeDoc.totalFrames;
const insO = expandInputs(routeDoc.fb ?? [], routeDoc.wg ?? [], totalFrames);

mkdirSync(OUT_DIR, { recursive: true });
const server = await serveOracle();
log(`probe ${routeName} level=${routeDoc.level} 帧数=${totalFrames} 伺服=${server.base}`);

let oracle;
try {
  oracle = await probeOracleRun({ serverBase: server.base, levelId, levelFile, totalFrames, fbIns: insO.fb, wgIns: insO.wg });
} finally {
  await server.close();
}
log(`oracle：ended=${oracle.ended} marks=${JSON.stringify(oracle.marks)} 帧=${oracle.frames} 采样=${oracle.samples.length}`);
log(`探针：施力 tick=${oracle.probe.ticks.length} ApplyForce=${oracle.probe.forces.length}`);

// ── 内核口径回放（同路线；逐步记 applyForce 收到的 nowS = 步前 simSeconds，world.ts:247→270 次序）
const insK = expandFlat(routeDoc.fb ?? [], routeDoc.wg ?? [], routeDoc.totalFrames);
const samples = oracle.samples;
const dtSeq = samples.map((s) => s.e / 1000); // oracle-gold 口径（goldcollect --compare 同式）

const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// 三口径统一回放：dt="fixed60"|"dtseq"；phaseS>0 时经 WorldOptions.windClockS 注入锚定相位（P3）
function replay({ dt = "fixed60", phaseS = 0, withDevs = false } = {}) {
  const w = phaseS ? (() => { let x; x = makeWorldOpt(routeDoc.level, { windClockS: () => x.simSeconds + phaseS }); return x; })() : makeWorld(routeDoc.level);
  const nowS = [], devs = [], devsPos = [];
  let end = null;
  for (let k = 0; k < samples.length; k++) {
    nowS.push(w.simSeconds); // 步前读 = 本步 applyForce 的 nowS（world.ts:247）
    const evs = w.step(dt === "fixed60" ? 1 / 60 : dtSeq[k], { fireboy: insK.fb[k], watergirl: insK.wg[k] });
    if (withDevs) {
      const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
      const os = samples[k];
      const d = [fb.x - os.fb[0], fb.y - os.fb[1], fb.vx - os.fb[2], fb.vy - os.fb[3], wg.x - os.wg[0], wg.y - os.wg[1], wg.vx - os.wg[2], wg.vy - os.wg[3]];
      devs.push(Math.max(...d.map(Math.abs)));
      devsPos.push(Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[4]), Math.abs(d[5]))); // 位置叶（fixture 比对面）
    }
    if (evs.some((e) => e.type === "win")) { end = { status: "won", frame: k }; break; }
    if (w.phase !== "playing") { end = { status: w.phase, frame: k }; break; }
    const fb2 = w.snapshotPlayer("fireboy"), wg2 = w.snapshotPlayer("watergirl");
    if (fb2.dead || wg2.dead) { end = { status: "dead", frame: k }; break; }
  }
  return { nowS, end, devs, devsPos };
}

const K1 = replay({ dt: "fixed60" });
const K2 = replay({ dt: "dtseq" });
log(`内核 P1 fixed-60：end=${JSON.stringify(K1.end)}；P2 实录 dtSeq：end=${JSON.stringify(K2.end)}`);

// oracle 施力帧（n → 采样序号）
const tickN = new Map(samples.map((s, i) => [s.n, i]));
const engagedIdx = oracle.probe.ticks.filter((t) => t.n != null).map((t) => tickN.get(t.n)).filter((v) => v != null);

// ── 相位差谱分析（sin 自变量域，ms）
const S = 1000 / 60;
const stats = (arr) => {
  const med = median(arr);
  const resid = arr.map((v) => v - med);
  return {
    n: arr.length, medianMs: +med.toFixed(6),
    minMs: +Math.min(...arr).toFixed(6), maxMs: +Math.max(...arr).toFixed(6),
    residMaxAbsMs: +Math.max(...resid.map(Math.abs)).toFixed(6),
    residP99AbsMs: +(function () { const s = [...resid].map(Math.abs).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))]; })().toFixed(6),
  };
};
const cmpN = Math.min(samples.length, K1.nowS.length, K2.nowS.length);
const dTheta1 = [], dTheta2 = [], model1 = [];
for (let k = 0; k < cmpN; k++) {
  const tho = samples[k].n / 1000; // oracle 风读点（整数 ms /1000）
  dTheta1.push((tho - K1.nowS[k]) * 1000);
  dTheta2.push((tho - K2.nowS[k]) * 1000);
  model1.push(Math.floor((k + 1) * S) - k * S); // 解析式（ms 域）：now_k=floor((k+1)·S)，P1 nowS_k=k·S
}
const st1 = stats(dTheta1), st2 = stats(dTheta2);
const modelErr1 = Math.max(...dTheta1.map((v, k) => Math.abs(v - model1[k])));
log(`P1 fixed-60  Δ：median=${st1.medianMs}ms 值域=[${st1.minMs},${st1.maxMs}]ms 残差(max)=${st1.residMaxAbsMs}ms（解析式对照最大偏差=${modelErr1.toExponential(2)}ms）`);
log(`P2 实录dtSeq Δ：median=${st2.medianMs}ms 值域=[${st2.minMs},${st2.maxMs}]ms 残差(max)=${st2.residMaxAbsMs}ms`);

// 量化下界 Q=1ms；三选一判定
const Q = 1;
const verdictOf = (st) =>
  st.residMaxAbsMs <= Q && Math.abs(st.medianMs) <= Q ? "对齐（残差≤量化下界）"
  : st.residMaxAbsMs <= Q ? "恒定偏移（可锚定修正）"
  : "结构性错位（公式级差异）";
const v1 = verdictOf(st1), v2 = verdictOf(st2);
log(`判定 P1 fixed-60：${v1}`);
log(`判定 P2 实录dtSeq：${v2}`);

// ── P3 锚定口径：dtSeq 同 P2，windClockS 相位 +median(Δ2)——与 P2 唯一差异=风相位
const K3 = replay({ dt: "dtseq", phaseS: st2.medianMs / 1000, withDevs: true });
const K2d = replay({ dt: "dtseq", withDevs: true });
const residStats = (devs) => {
  const sorted = [...devs].sort((a, b) => a - b);
  return {
    median: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    p99: +sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))].toFixed(3),
    max: +sorted[sorted.length - 1].toFixed(3), maxAt: devs.indexOf(sorted[sorted.length - 1]),
  };
};
const t2 = residStats(K2d.devs), t3 = residStats(K3.devs);
const p2 = residStats(K2d.devsPos), p3 = residStats(K3.devsPos);
log(`轨迹 A/B（vs oracle 金）：位置叶 P2 ${JSON.stringify(p2)} / P3 ${JSON.stringify(p3)}；复合8分量 P2 ${JSON.stringify(t2)} / P3 ${JSON.stringify(t3)}（PHASE=+${st2.medianMs}ms）`);
// 位置叶差帧（>tol 候选）：风 engage 前/后分账
const firstEng = engagedIdx.length ? engagedIdx[0] : -1;
let preMax = 0, postMax = 0;
for (let k = 0; k < K2d.devsPos.length; k++) (firstEng >= 0 && k < firstEng ? (preMax = Math.max(preMax, K2d.devsPos[k])) : (postMax = Math.max(postMax, K2d.devsPos[k])));
log(`位置叶 max 分账：风 engage(f${firstEng}) 前=${preMax.toFixed(2)}px（非风贡献下界） 后=${postMax.toFixed(2)}px`);

// ── 风因子误差（oracle 施力 tick 上，w=1.2+0.2·sin(θ)）
const wErr = (nowSK, medMs) => {
  let raw = 0, anchored = 0;
  for (const k of engagedIdx) {
    const tho = samples[k].n / 1000;
    const thk = nowSK[k];
    raw = Math.max(raw, Math.abs(1.2 + 0.2 * Math.sin(tho) - (1.2 + 0.2 * Math.sin(thk))));
    anchored = Math.max(anchored, Math.abs(0.2 * (Math.sin(tho) - Math.sin(thk + medMs / 1000))));
  }
  return { raw, anchored, frames: engagedIdx.length };
};
const w1 = wErr(K1.nowS, st1.medianMs), w2 = wErr(K2.nowS, st2.medianMs);
log(`风因子|maxErr|：P1 原始=${w1.raw.toPrecision(4)} 锚定修正后=${w1.anchored.toExponential(2)}；P2 原始=${w2.raw.toPrecision(4)} 修正后=${w2.anchored.toExponential(2)}（施力帧=${engagedIdx.length}）`);

// ── oracle 力公式端到端验证：|F| vs (1.2+0.2 sin(n/1000))·100·(1−dist/len)
let fMaxErr = 0, fRel = 0;
for (const c of oracle.probe.forces) {
  const dist = Math.hypot(c.bx - c.wx, c.by - c.wy);
  const pred = (1.2 + 0.2 * Math.sin(c.n / 1000)) * 100 * (1 - dist / c.len);
  const obs = Math.hypot(c.fx, c.fy);
  const e = Math.abs(obs - pred);
  fMaxErr = Math.max(fMaxErr, e);
  if (Math.abs(pred) > 1) fRel = Math.max(fRel, e / Math.abs(pred));
}
log(`力公式端到端：${oracle.probe.forces.length} 笔 ApplyForce，|obs−pred| max=${fMaxErr.toExponential(3)}（相对 max=${fRel.toExponential(3)}）`);

// ── 落盘
const report = {
  kind: "windphase-probe", route: routeName, level: routeDoc.level, generatedBy: "scripts/e2e/oracle/windphase.mjs",
  oracle: { ended: oracle.ended, marks: oracle.marks, frames: oracle.frames, samples: samples.length },
  probe: { windTicks: oracle.probe.ticks.length, applyForces: oracle.probe.forces.length, engagedSampleIdxHead: engagedIdx.slice(0, 5), engagedCount: engagedIdx.length },
  kernel: { P1_fixed60_end: K1.end, P2_dtseq_end: K2.end, P3_anchored_end: K3.end },
  phase: {
    Q_ms: Q,
    P1_fixed60: { ...st1, modelMaxErrMs: modelErr1, verdict: v1 },
    P2_dtseq: { ...st2, verdict: v2 },
    P3_anchorMs: st2.medianMs,
    windFactorMaxErr: { P1: w1, P2: w2 },
  },
  trajAB: {
    P2_phase0: t2, P3_anchored: t3,
    posLeaf: { P2_phase0: p2, P3_anchored: p3, firstEngagedSample: engagedIdx[0] ?? -1, preEngageMaxPx: +preMax.toFixed(3), postEngageMaxPx: +postMax.toFixed(3) },
  },
  forceFormulaCheck: { count: oracle.probe.forces.length, maxAbsErr: fMaxErr, maxRelErr: fRel },
  dThetaHead: { P1: dTheta1.slice(0, 12).map((v) => +v.toFixed(4)), P2: dTheta2.slice(0, 12).map((v) => +v.toFixed(4)) },
  samples: samples.map((s) => ({ n: s.n, e: s.e })), // oracle 相位谱原始数据（n 序列），供复核
};
const outFile = join(OUT_DIR, `windphase-${routeName}.json`);
writeFileSync(outFile, JSON.stringify(report));
log(`report → ${outFile}`);
process.exit(0);

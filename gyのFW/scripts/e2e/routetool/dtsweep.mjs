/**
 * dt 扫描器（behavior-parity 推荐二，survey 01 号档 §6）：把"同输入跨 dt 轨迹差 200px"
 * 的单点数字变成敏感度谱。对每条路线 × 每个 dt 调度回跑内核，量化固定 1/60 距可变 dt
 * 行为面差多少、差在哪类关。
 *
 * 用法：
 *   node --import tsx scripts/e2e/routetool/dtsweep.mjs --all --outDir note/research/2026-10-behavior-parity/tools/dtsweep
 *   node --import tsx scripts/e2e/routetool/dtsweep.mjs --levels forest_01,forest_03 --outDir TEMP/dtsweep/out
 *   node --import tsx scripts/e2e/routetool/dtsweep.mjs --selftest          # 基线等价+确定性自检
 *   node --import tsx scripts/e2e/routetool/dtsweep.mjs --probe25           # forest_25 p59 政策探针（合成谱）
 *
 * 设计（两个映射口径，回答两个不同问题）：
 *   time  映射（oracle 口径，主表）：事件按墙时 t=f/60s 触发（≤累计墙时+ε 即触发），跑到
 *              Σdt ≥ totalFrames/60——输入时间线与仿真墙时都保持，对应 oracle 墙钟键盘注入
 *              （多步×小 dt）。含输入重量化相位差（事件落在调度步栅格上，≤最大 dt 的半步内），
 *              这是真实 oracle 变 tick 回放固有的，不是伪影。
 *   frame 映射（naive 重挂 tick 口径，副表）：事件按步索引触发（= runKernel 原语义），
 *              totalFrames 步——把同一份帧索引脚本在别的 tick 率下照帧号回放，输入墙时整体
 *              ×(60·dt) 缩放（120hz=整条输入程序 2× 快进）。度量的是路线 JSON tickHz=60
 *              假设被破坏的后果；对 oracle 对拍不构成口径。
 * 基线（60hz×frame）必须与 runKernel 位级一致（--selftest 断言）。
 *
 * 内核只读：本工具不修改 kernel.mjs / world.ts；内核审计结论见 03-dt-sweep.md §1。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, isAbsolute, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, log, ROOT } from "../lib.mjs";
import { makeWorld, runKernel } from "./kernel.mjs";

// ---------------------------------------------------------------- dt 调度集（合成谱，oracle 实测谱另行采集）

/** mulberry32：确定性 PRNG（同 seed 逐位同序列） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MS = 0.001;
/**
 * 合成调度集。60hz 是基线；其余为变 dt 面。
 * 每次调用新建（RNG 闭包有状态：每关必须独立建，保证各关拿到同一条 dt 序列）。
 */
export function makeSchedules(seed = 20261017) {
  const jitterR = mulberry32(seed);
  const spikeR = mulberry32(seed * 7 + 1);
  return [
    { name: "60hz", desc: "基线固定 16.667ms", next: () => 1 / 60 },
    { name: "120hz", desc: "固定 8.333ms", next: () => 1 / 120 },
    { name: "144hz", desc: "固定 6.944ms", next: () => 1 / 144 },
    { name: "50hz", desc: "固定 20ms", next: () => 1 / 50 },
    {
      name: "jitter8ms", desc: "60Hz±U(−8,+8)ms 夹 [4,33]ms",
      next: () => Math.min(33 * MS, Math.max(4 * MS, 1 / 60 + (jitterR() * 2 - 1) * 8 * MS)),
    },
    {
      name: "spike5pct", desc: "60Hz + 5% 概率 33ms 掉帧尖峰",
      next: () => (spikeR() < 0.05 ? 33 * MS : 1 / 60),
    },
  ];
}

// ---------------------------------------------------------------- 路线事件的时间域展开

/**
 * 路线平坦事件表 → 时间域事件流。路线帧号定义在 60Hz 网格上：事件 f 的墙时 = f/60 s。
 * 同帧先 up 后 down（与 kernel.mjs expandFlat 同序）。
 */
export function eventsToTimeline(fbEvs, wgEvs) {
  const mk = (evs) => {
    const sorted = [...evs].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
    return sorted.map((e) => ({ t: e.f / 60, dir: e.dir, down: e.type === "down" }));
  };
  return { fb: mk(fbEvs), wg: mk(wgEvs) };
}

/**
 * 按调度回跑一条路线。mapping: "frame"=步索引事件（totalFrames 步）；
 * "time"=墙时事件（跑到 Σdt ≥ totalFrames/60）。返回结局+终点+逐步 trace。
 */
export function runWithSchedule(level, routeDoc, schedule, mapping) {
  const total = routeDoc.totalFrames;
  const totalWall = total / 60;
  const tl = eventsToTimeline(routeDoc.fb, routeDoc.wg);
  const streams = {
    fireboy: { st: { up: false, left: false, right: false }, evs: tl.fb, applied: 0 },
    watergirl: { st: { up: false, left: false, right: false }, evs: tl.wg, applied: 0 },
  };
  const EPS = 1e-9;
  const maxSteps = mapping === "frame" ? total : Math.ceil(totalWall / (4 * MS)) + 60;

  const w = makeWorld(level);
  const trace = [];
  let t = 0;
  let out = { won: false, deathF: -1, winF: -1 };
  for (let k = 0; k < maxSteps; k++) {
    for (const role of ["fireboy", "watergirl"]) {
      const s = streams[role];
      // frame 映射：事件 f 在步 k(=f) 触发（gate=k/60，与 t=f/60 同式比较无浮点相移）；
      // time 映射：事件在累计墙时追上其墙时那一刻触发
      const gate = mapping === "frame" ? k / 60 : t;
      while (s.applied < s.evs.length && s.evs[s.applied].t <= gate + EPS) {
        const e = s.evs[s.applied++];
        s.st[e.dir] = e.down;
      }
    }
    const dt = schedule.next(k);
    w.step(dt, { fireboy: { ...streams.fireboy.st }, watergirl: { ...streams.watergirl.st } });
    t += dt;
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    trace.push({ f: k, t, fb: [fb.x, fb.y], wg: [wg.x, wg.y] });
    if (fb.dead || wg.dead || fb.dying || wg.dying) { out = { won: false, deathF: k, winF: -1 }; break; }
    if (w.phase === "won") { out = { won: true, deathF: -1, winF: k }; break; }
    if (mapping === "time" && t >= totalWall - EPS) break; // 路线长度耗尽=超时
  }
  const last = trace[trace.length - 1] ?? null;
  return {
    ...out,
    steps: trace.length,
    endT: t,
    fbEnd: last?.fb ?? null,
    wgEnd: last?.wg ?? null,
    trace,
    applied: { fireboy: streams.fireboy.applied, watergirl: streams.watergirl.applied },
  };
}

// ---------------------------------------------------------------- 基线对比度量

/** 两 trace 的最大位移偏差（双角色，px）。frame：同索引；time：被扫步按墙时取基线最近步。 */
export function traceDeviation(baseTrace, trace, mapping) {
  let maxDev = 0, maxAt = -1, onset = -1;
  const THRESH = 2; // px，偏离超过此值算"漂移发作"
  for (let i = 0; i < trace.length; i++) {
    const s = trace[i];
    // 基线第 bi 条 = 状态 after (bi+1) 步、墙时 (bi+1)/60；状态 t 对应 bi=round(t*60)−1
    let bi = i;
    if (mapping === "time") bi = Math.min(baseTrace.length - 1, Math.max(0, Math.round(s.t * 60) - 1));
    const b = baseTrace[bi];
    if (!b) break;
    for (const role of ["fb", "wg"]) {
      const d = Math.hypot(s[role][0] - b[role][0], s[role][1] - b[role][1]);
      if (d > maxDev) { maxDev = d; maxAt = i; }
      if (onset < 0 && d > THRESH) onset = i;
    }
  }
  return { maxDev, maxAt, onset };
}

// ---------------------------------------------------------------- 主扫描

export function primaryRoutePath(level) {
  return join(ROOT, "scripts", "e2e", "inputs", "routes", `${level}.json`);
}

/** 路线覆盖：routes 目录里形状完整的主路线（<level>.json）——forest_29 只剩搜索快照，无路线 */
export function coveredLevels() {
  return ["forest_01", "forest_02", "forest_03", "forest_04", "forest_05", "forest_06", "forest_06_1", "forest_07", "forest_12", "forest_15", "forest_26", "forest_32"]
    .filter((lv) => existsSync(primaryRoutePath(lv)));
}

/** 单关全调度扫描。每关重建调度（RNG 闭包有状态，保证各关吃同一条 dt 序列）。 */
export function sweepLevel(level, seed = 20261017) {
  const schedules = makeSchedules(seed);
  const routeDoc = JSON.parse(readFileSync(primaryRoutePath(level), "utf8"));
  const baseOut = [];
  const base = runKernel(level, routeDoc, { traceTo: baseOut });
  const baseTrace = baseOut.map((p) => ({ t: (p.f + 1) / 60, fb: p.fb, wg: p.wg }));
  const baseTimeS = (base.winF + 1) / 60;
  const runs = [];
  for (const sched of schedules) {
    for (const mapping of ["frame", "time"]) {
      const r = runWithSchedule(level, routeDoc, sched, mapping);
      const dev = traceDeviation(baseTrace, r.trace, mapping);
      // 事件墙时 = trace 里的累计 Σdt（非 (f+1)/60——那只在 60hz 基线成立）
      const evT = (i) => (i >= 0 && i < r.trace.length ? r.trace[i].t : null);
      const rTimeS = r.winF >= 0 ? evT(r.winF) : null;
      runs.push({
        schedule: sched.name, mapping,
        outcome: r.won ? "WIN" : (r.deathF >= 0 ? `DEAD@f${r.deathF}` : "TIMEOUT"),
        winF: r.winF, deathF: r.deathF, steps: r.steps, endT: +r.endT.toFixed(4),
        eventTimeS: r.winF >= 0 ? +rTimeS.toFixed(4) : (r.deathF >= 0 ? +evT(r.deathF).toFixed(4) : null),
        winFDeltaSteps: base.winF >= 0 && r.winF >= 0 ? r.winF - base.winF : null,
        winTimeDeltaS: base.winF >= 0 && r.winF >= 0 ? +(rTimeS - baseTimeS).toFixed(4) : null,
        maxDevPx: +dev.maxDev.toFixed(2), maxDevAt: dev.maxAt, devOnsetF: dev.onset,
        fbEnd: r.fbEnd?.map((v) => +v.toFixed(1)), wgEnd: r.wgEnd?.map((v) => +v.toFixed(1)),
      });
      // 基线自证：60hz×frame 必须与 runKernel 结局+抽样轨迹位级一致
      if (sched.name === "60hz" && mapping === "frame") {
        if ((base.won ? "WIN" : base.deathF >= 0 ? `DEAD@f${base.deathF}` : "TIMEOUT") !== runs[runs.length - 1].outcome
          || (base.won && base.winF !== r.winF)) {
          throw new Error(`${level} 60hz×frame 结局与 runKernel 不一致: ${JSON.stringify(base)} vs ${JSON.stringify(runs[runs.length - 1])}`);
        }
        for (const i of [0, Math.floor(r.trace.length / 3), Math.floor((2 * r.trace.length) / 3), r.trace.length - 1]) {
          const bp = baseOut[Math.min(i, baseOut.length - 1)];
          if (bp.fb[0] !== r.trace[i].fb[0] || bp.fb[1] !== r.trace[i].fb[1] || bp.wg[0] !== r.trace[i].wg[0] || bp.wg[1] !== r.trace[i].wg[1]) {
            throw new Error(`${level} 60hz×frame 位级漂移 @${i}: ${bp.fb}/${bp.wg} vs ${r.trace[i].fb}/${r.trace[i].wg}`);
          }
        }
      }
    }
  }
  return {
    level, route: primaryRoutePath(level), totalFrames: routeDoc.totalFrames,
    baseline: { ...base, winTimeS: base.winF >= 0 ? +baseTimeS.toFixed(4) : null },
    runs,
  };
}

// ---------------------------------------------------------------- forest_25 政策探针（p59 复刻 + 合成调度）

/**
 * p59 同款反馈政策（TEMP/main25/p59-dt-sweep.mjs 逐行口径）：wg 向右，y 阈值控跳，
 * 跳周期 jumpPeriod。东极限 = 离开出生高台后的最大 x。本探针是"政策输入"不是路线输入，
 * 与 p59 直接可比；p59 只扫固定 dt，这里补 jitter/spike 合成谱。
 */
export function probe25(schedule, jumpPeriod = 40, frames = 1500) {
  const N = { up: false, left: false, right: false };
  const w = makeWorld("forest_25");
  let maxX = 0, maxXf = 0, landed = false;
  for (let f = 0; f < frames; f++) {
    const q = w.snapshotPlayer("watergirl");
    let inp;
    if (f < 90) inp = N;
    else if (q.y < 205) inp = { up: false, left: true, right: false };
    else inp = f % jumpPeriod < 1 ? { up: true, left: false, right: true } : { up: false, left: false, right: true };
    if (!landed && q.x < 1000 && q.y > 200) landed = true;
    if (landed && q.x > maxX) { maxX = q.x; maxXf = f; }
    w.step(schedule.next(f), { fireboy: N, watergirl: inp });
    if (q.dead) break;
  }
  return { maxX: +maxX.toFixed(1), maxXf, landed };
}

// ---------------------------------------------------------------- CLI

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const hasFlag = (name) => argv.includes(`--${name}`);
  const seed = Number(argOf(argv, "seed", "20261017"));

  if (hasFlag("selftest")) {
    // 自检 1：60hz×frame 与 runKernel 位级一致；自检 2：60hz 下 time 映射同相（事件量化逐位同刻）；
    // 自检 3：jitter 同 seed 双跑位级一致（调度确定性）。
    for (const level of ["forest_01", "forest_03"]) {
      const routeDoc = JSON.parse(readFileSync(primaryRoutePath(level), "utf8"));
      const rkTrace = [];
      const rk = runKernel(level, routeDoc, { traceTo: rkTrace });
      const scheds = makeSchedules(seed);
      const rs = runWithSchedule(level, routeDoc, scheds[0], "frame");
      if (rk.won !== rs.won || rk.winF !== rs.winF || rk.deathF !== rs.deathF) throw new Error(`自检1 失败 ${level}`);
      for (let i = 0; i < rs.trace.length; i++) {
        if (rkTrace[i].fb[0] !== rs.trace[i].fb[0] || rkTrace[i].fb[1] !== rs.trace[i].fb[1]
          || rkTrace[i].wg[0] !== rs.trace[i].wg[0] || rkTrace[i].wg[1] !== rs.trace[i].wg[1]) {
          throw new Error(`自检1 位级漂移 ${level}@${i}: ${rkTrace[i].fb} vs ${rs.trace[i].fb}`);
        }
      }
      const rt = runWithSchedule(level, routeDoc, scheds[0], "time");
      if (rk.won !== rt.won || rk.winF !== rt.winF) throw new Error(`自检2 失败 ${level}: frame winF=${rk.winF} time winF=${rt.winF}`);
      for (let i = 0; i < rt.trace.length; i++) {
        if (rkTrace[i].fb[0] !== rt.trace[i].fb[0] || rkTrace[i].wg[1] !== rt.trace[i].wg[1]) {
          throw new Error(`自检2 位级漂移 ${level}@${i}`);
        }
      }
      const j1 = runWithSchedule(level, routeDoc, makeSchedules(seed)[4], "frame");
      const j2 = runWithSchedule(level, routeDoc, makeSchedules(seed)[4], "frame");
      if (JSON.stringify(j1.trace) !== JSON.stringify(j2.trace)) throw new Error(`自检3 失败 ${level}（jitter 双跑不一致）`);
      log(`selftest ${level}: 自检1/2/3 全过（winF=${rk.winF}，time 同相位级一致，jitter 双跑一致）`);
    }
    process.exit(0);
  }

  if (hasFlag("probe25")) {
    console.log("schedule\t跳周期\t东极限x\t帧号\tlanded");
    const fixed = [1 / 45, 1 / 50, 1 / 55, 1 / 60, 1 / 65, 1 / 70, 1 / 80].map((dt) => ({ name: `1/${Math.round(1 / dt)}`, next: () => dt }));
    const synth = makeSchedules(seed).filter((s) => s.name !== "60hz");
    const rows = [];
    for (const s of [...fixed, ...synth]) {
      for (const jp of [34, 40, 46]) { // p59 同款三跳周期（固定 dt 组合可与其 21 组合直比）
        const r = probe25(s, jp);
        rows.push({ schedule: s.name, jp, ...r });
        console.log(`${s.name}\t${jp}\t${r.maxX}\t${r.maxXf}\t${r.landed}`);
      }
    }
    const xs = rows.map((r) => r.maxX);
    const bySched = {};
    for (const r of rows) bySched[r.schedule] = Math.max(bySched[r.schedule] ?? 0, r.maxX);
    console.table(Object.fromEntries(Object.entries(bySched).map(([k, v]) => [k, { eastMax: v }])));
    console.log(`[e2e] 东极限域 [${Math.min(...xs)}, ${Math.max(...xs)}]，极差 ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}px（p59 固定 dt 域 795.8~996.7；缺口 1056 全部未达）`);
    const pOut = argOf(argv, "outDir", join(ROOT, "TEMP", "dtsweep"));
    const pDir = isAbsolute(pOut) ? pOut : join(ROOT, pOut);
    mkdirSync(pDir, { recursive: true });
    writeFileSync(join(pDir, "probe25.json"), JSON.stringify({ seed, jumpPeriods: [34, 40, 46], rows, note: "p59 同款反馈政策（政策输入非路线输入）；固定 dt 7 档 × 3 跳周期与 TEMP/main25/p59-dt-sweep.mjs 直比" }));
    log(`probe25 数据 → ${join(pDir, "probe25.json")}`);
    process.exit(0);
  }

  const levelsArg = argOf(argv, "levels");
  const all = hasFlag("all");
  const outDir = argOf(argv, "outDir", join(ROOT, "note", "research", "2026-10-behavior-parity", "tools", "dtsweep"));
  const levels = levelsArg ? levelsArg.split(",") : (all ? coveredLevels() : ["forest_01"]);
  const dirAbs = isAbsolute(outDir) ? outDir : join(ROOT, outDir);
  mkdirSync(dirAbs, { recursive: true });
  const t0 = Date.now();
  const summary = [];
  for (const level of levels) {
    const res = sweepLevel(level, seed);
    const p = join(dirAbs, `${level}.json`);
    writeFileSync(p, JSON.stringify(res));
    for (const r of res.runs) summary.push({ level, ...r });
    log(`${level}: ${res.runs.length} 组合 → ${p}（${Date.now() - t0}ms 累计）`);
  }
  console.log("\nlevel\tschedule\tmap\toutcome\twinΔs\tmaxDevPx\tonsetF");
  for (const s of summary) {
    console.log(`${s.level}\t${s.schedule}\t${s.mapping}\t${s.outcome}\t${s.winTimeDeltaS ?? "-"}\t${s.maxDevPx}\t${s.devOnsetF ?? "-"}`);
  }
  const csv = join(dirAbs, "summary.csv");
  writeFileSync(csv, ["level,schedule,mapping,outcome,winF,deathF,steps,endT,eventTimeS,winFDeltaSteps,winTimeDeltaS,maxDevPx,maxDevAt,devOnsetF,fbEnd,wgEnd",
    ...summary.map((s) => [s.level, s.schedule, s.mapping, s.outcome, s.winF, s.deathF, s.steps, s.endT, s.eventTimeS ?? "", s.winFDeltaSteps ?? "", s.winTimeDeltaS ?? "", s.maxDevPx, s.maxDevAt, s.devOnsetF ?? "", JSON.stringify(s.fbEnd), JSON.stringify(s.wgEnd)].join(","))].join("\n"));
  log(`完成 ${levels.length} 关 × ${makeSchedules().length} 调度 × 2 映射，${Date.now() - t0}ms；摘要 → ${csv}`);
}

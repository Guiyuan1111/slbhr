/**
 * 金轨迹 fixture 回归 runner（Ruffle tests/swfs 协议的内核侧对应物，调研依据
 * note/research/2026-10-behavior-parity/01-survey.md §5.1/§6 推荐三）。
 *
 * 协议：scripts/e2e/fixtures/<level>/<case>/ =
 *   route.json    输入事件流（与 inputs/routes/*.json 同构，直接喂 kernel.mjs）
 *   meta.json     配置声明 { source, dtSchedule, tolerance, sampleEvery, mechEvery, notes }
 *   expected.json 金输出 { format, 头部, outcome, frames[] }（--update 重录）
 *
 * 容差语义：tolerance=0 → 位级比对（v1 内核自基线锁行为）；>0 → 数值叶 atol 逐帧比对
 * （oracle 金输出）。帧号 f / outcome.frame / outcome.status 恒为精确比对
 * （逻辑索引不是测量量）。sampleEvery=K 时抽样帧 = f%K===0 ∪ 结局帧 ∪ 末帧，
 * 抽样帧的 ev = 自上个抽样帧以来累计的全部内核事件（WorldEvent 原样）。
 *
 * oracle 金输出扩展（2026-10-17 goldfix 槽，全部 meta 可选 flag、缺省=原行为，v1 零影响）：
 *   dtSchedule "ms-quantized-rec"  实录 dt 序列（caseDir/dtschedule.json，单位 ms）；
 *                                  采集链 scripts/e2e/oracle/goldcollect.mjs。
 *   compareEvents=false            跳过 ev 叶（oracle 侧采不到内核 WorldEvent）。
 *   comparePhase=false             跳过 ph 叶（oracle ph 恒 "level"，win 帧与内核错位）。
 *   compareVelocities=false        只比位置 x/y（±1 帧落地相位使速度叶 atol 不可公度）。
 *   outcomeWindowF=N               outcome.frame 允 ±N 帧（status 恒精确）——oracle 与内核
 *                                  存在行为性时长偏移（forest_01 同 dt 下 2367 vs 2463）。
 *   alignShift=N（缺省 0=原行为）  采样对齐偏移（netopt 槽 11 号档）：oracle 采样器=物理 Step
 *                                  前采样 → oracle sample[k]≡kernel frame[k−1]，即内核帧 k 应对
 *                                  expected 帧 k+alignShift（N=1）。expected 头部 N 帧（Step 前的
 *                                  初值样本）无内核对应帧，跳过；尾部 oracle 独有帧（行为性时长
 *                                  偏移）由 outcomeWindowF 语义承认，帧流长度差不另报。
 *   source="oracle" 的 case 禁用 --update（防内核回放覆盖金输出；重录走 goldcollect）。
 *
 * 用法（node 直跑，无新依赖；不接 CI、无 npm script）：
 *   node --import tsx scripts/e2e/routetool/fixture-runner.mjs
 *   node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter forest_01
 *   node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter forest_01/main --update
 *
 * --update：重录 expected.json（有意变更时刷新基线），旧基线存在则输出 diff 摘要供人审。
 * 全绿 exit 0，任何 FAIL/协议错误 exit 1。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { argOf, log, ROOT } from "../lib.mjs";
import { makeWorld, expandFlat } from "./kernel.mjs";

const FIXTURES_DIR = join(ROOT, "scripts", "e2e", "fixtures");
const EXPECTED_FORMAT = 1;
/** 单帧 FAIL 明细最多列出的发散叶数（防刷屏，完整看 maxDev 定位） */
const MAX_LEAF_REPORT = 8;

// -------------------------------------------------- 协议：dt 调度

/**
 * dtSchedule → 每帧 dt 函数。
 *  - "fixed-60"：每帧恒 1/60（v1 内核自基线）。
 *  - "ms-quantized-rec"：实录 dt 序列（caseDir/dtschedule.json，单位 ms，首元素=虚拟钟
 *    arm 跳变钳制帧 1000/60，其后为整数 ms 序列）；dt = 值/1000，与 oracle
 *    world.Step(min(0.04, elapsed/1000)) 同一浮点算式。序列不足路线长度 → 报错。
 * 采集链：scripts/e2e/oracle/goldcollect.mjs（--capture → --build-fixture）。
 */
function makeDtFn(dtSchedule, caseDir) {
  if (dtSchedule === "fixed-60") return () => 1 / 60;
  if (dtSchedule === "ms-quantized-rec") {
    const doc = JSON.parse(readFileSync(join(caseDir, "dtschedule.json"), "utf8"));
    if (doc.format !== 1) throw new Error(`dtschedule.format=${doc.format}，runner 支持 1`);
    if (!Array.isArray(doc.dt) || !doc.dt.length || !doc.dt.every(Number.isFinite))
      throw new Error("dtschedule.dt 须为非空有限数值数组（单位 ms）");
    return (f) => {
      if (f >= doc.dt.length) throw new Error(`dtschedule 序列长 ${doc.dt.length} 不足覆盖帧 ${f}`);
      return doc.dt[f] / 1000;
    };
  }
  throw new Error(`未知 dtSchedule "${dtSchedule}"（支持 fixed-60 / ms-quantized-rec）`);
}

// -------------------------------------------------- 回放

/** PlayerSnapshot → 金轨迹状态叶（v1 核心四量，屏幕 px / px·s⁻¹） */
const pickPlayer = (p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy });

/**
 * 内核回放一条 route，产出抽样状态流 + 结局。终止语义与 runKernel 一致：
 * dying/dead 先判（死亡优先），w.phase==="won" 后判，跑满 totalFrames 为 timeout。
 * @returns {{ frames: Array, outcome: { status, frame, timerMs } }}
 */
function replay(level, routeDoc, meta, caseDir) {
  const dtFn = makeDtFn(meta.dtSchedule, caseDir);
  if (routeDoc.tickHz !== 60) throw new Error(`route.tickHz=${routeDoc.tickHz}，本协议按 60Hz 输入网格语义要求 60`);
  const total = routeDoc.totalFrames;
  const sampleEvery = meta.sampleEvery ?? 1;
  const mechEvery = meta.mechEvery ?? 0;
  if (!Number.isInteger(sampleEvery) || sampleEvery < 1) throw new Error(`sampleEvery 须为 ≥1 整数，got ${sampleEvery}`);

  const ins = expandFlat(routeDoc.fb, routeDoc.wg, total);
  const w = makeWorld(level);
  const frames = [];
  let pendingEvents = [];
  let outcome = null;

  for (let f = 0; f < total; f++) {
    const evs = w.step(dtFn(f), { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    if (evs.length) pendingEvents.push(...evs);
    const fb = w.snapshotPlayer("fireboy");
    const wg = w.snapshotPlayer("watergirl");
    const ended = fb.dying || fb.dead || wg.dying || wg.dead || w.phase === "won";
    if (f % sampleEvery === 0 || ended || f === total - 1) {
      const rec = { f, ph: w.phase, fb: pickPlayer(fb), wg: pickPlayer(wg), ev: pendingEvents };
      if (mechEvery > 0 && (f % mechEvery === 0 || ended || f === total - 1)) rec.mech = w.mechSnapshot();
      frames.push(rec);
      pendingEvents = [];
    }
    if (fb.dying || fb.dead || wg.dying || wg.dead) { outcome = { status: "dead", frame: f }; break; }
    if (w.phase === "won") { outcome = { status: "won", frame: f }; break; }
  }
  if (!outcome) outcome = { status: "timeout", frame: total - 1 };
  outcome.timerMs = w.timerMs;
  return { frames, outcome };
}

// -------------------------------------------------- 比对

/**
 * 递归结构比对。数值叶按 tol（0=位级）；其余类型严格。帧逻辑索引由调用方先精确校验。
 * @returns {{ dev: number }} dev=数值叶最大 |a−b|（无可比数值叶为 0）；不匹配时往 out 推叶子明细
 */
function diffInto(path, a, b, tol, out, acc) {
  if (typeof a === "number" && typeof b === "number") {
    const dev = Math.abs(a - b);
    if (dev > acc.maxDev) acc.maxDev = dev, acc.maxDevPath = path;
    if (!(tol > 0 ? dev <= tol : dev === 0)) out.push({ path, expected: a, actual: b, dev });
    return { dev };
  }
  const aUndef = a === undefined, bUndef = b === undefined;
  if (aUndef || bUndef) { out.push({ path, expected: aUndef ? "<缺>" : a, actual: bUndef ? "<缺>" : b }); return { dev: NaN }; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push({ path, expected: Array.isArray(a) ? `arr[${a.length}]` : a, actual: Array.isArray(b) ? `arr[${b.length}]` : b });
      return { dev: NaN };
    }
    let dev = 0;
    for (let i = 0; i < a.length; i++) dev = Math.max(dev, diffInto(`${path}[${i}]`, a[i], b[i], tol, out, acc).dev || 0);
    return { dev };
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    let dev = 0;
    for (const k of ka) if (!(k in b)) out.push({ path: `${path}.${k}`, expected: a[k], actual: "<缺>" });
    for (const k of kb) if (!(k in a)) out.push({ path: `${path}.${k}`, expected: "<缺>", actual: b[k] });
    for (const k of ka) if (k in b) dev = Math.max(dev, diffInto(`${path}.${k}`, a[k], b[k], tol, out, acc).dev || 0);
    return { dev };
  }
  if (a !== b) out.push({ path, expected: a, actual: b });
  return { dev: 0 };
}

const fmtVal = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toExponential(6)) : JSON.stringify(v));
const fmtLeaves = (leaves) => leaves.slice(0, MAX_LEAF_REPORT)
  .map((l) => `    ${l.path}: 期望 ${fmtVal(l.expected)} 实际 ${fmtVal(l.actual)}${l.dev !== undefined ? ` (Δ=${l.dev})` : ""}`)
  .join("\n") + (leaves.length > MAX_LEAF_REPORT ? `\n    …另 ${leaves.length - MAX_LEAF_REPORT} 处不匹配` : "");

/**
 * oracle-gold 比对开关（meta 缺省 = 全量比对，v1 零影响；均为可选 flag）：
 *  - compareEvents=false：跳过 ev 叶（oracle 侧采不到内核 WorldEvent 语义）；
 *  - comparePhase=false：跳过 ph 叶（oracle ph 恒 "level" 无比对值，且 win 帧与内核错位）；
 *  - compareVelocities=false：只比位置 x/y（速度叶有 ±1 帧落地相位尖峰，atol 语义下不可公度）。
 */
function stripFrames(frames, meta) {
  const stripEv = meta.compareEvents === false;
  const stripPh = meta.comparePhase === false;
  const stripVel = meta.compareVelocities === false;
  if (!stripEv && !stripPh && !stripVel) return frames;
  return frames.map((f) => {
    let r = f;
    if ((stripEv && "ev" in r) || (stripPh && "ph" in r)) {
      r = { ...r };
      if (stripEv) delete r.ev;
      if (stripPh) delete r.ph;
    }
    if (stripVel && r.fb && r.wg) r = { ...r, fb: { x: r.fb.x, y: r.fb.y }, wg: { x: r.wg.x, y: r.wg.y } };
    return r;
  });
}

/**
 * 比对回放结果 vs expected.json；返回 { ok, problems: string[] }。
 * meta.outcomeWindowF（>0 时）：outcome.status 恒精确，outcome.frame 允 ±N 帧窗口
 * （oracle 与内核存在行为性时长偏移，如 forest_01 同 dt 序列下 2367 vs 2463）；
 * 窗口成立时帧流长度差异不再另报（尾部错位已被窗口承认）。
 */
function compare(replayed, expected, tol, meta = {}) {
  const problems = [];
  const acc = { maxDev: 0, maxDevPath: "" };
  const windowF = meta.outcomeWindowF > 0 ? meta.outcomeWindowF : 0;
  // 采样对齐（meta.alignShift，缺省 0=原行为）：内核帧 k ↔ expected 帧 k+alignShift。
  // 配对按帧号 Map 精确检索（expected 流缺该帧即协议错误）；配对成立即帧号"恒精确比对"
  // 在对齐语义下成立，diff 前把 expected 视图的 f 重标为内核帧号（f 是逻辑索引不是测量量）。
  const alignShift = meta.alignShift ?? 0;
  if (!Number.isInteger(alignShift) || alignShift < 0) throw new Error(`meta.alignShift 须为 ≥0 整数，got ${alignShift}`);
  const outcomeOk = expected.outcome.status === replayed.outcome.status
    && (windowF > 0
      ? Math.abs(expected.outcome.frame - replayed.outcome.frame) <= windowF
      : expected.outcome.frame === replayed.outcome.frame);
  if (!outcomeOk) {
    problems.push(`结局不一致: 期望 ${expected.outcome.status}@f${expected.outcome.frame} 实际 ${replayed.outcome.status}@f${replayed.outcome.frame}${windowF > 0 ? `（窗口 ±${windowF} 帧）` : ""}`);
  }
  const exp = stripFrames(expected.frames, meta), act = stripFrames(replayed.frames, meta);
  let firstDivergence = -1, leaves = [];
  if (alignShift > 0) {
    const expByF = new Map(exp.map((e) => [e.f, e]));
    // 终端帧对不比：内核终态帧（won/dead 即回放终点）在对齐下其 expected 对应帧 k+alignShift
    // 已越过 oracle 终幕边界（win 后门内收拢动画帧，内核不回放该段；11 号档 forest_01 实证
    // f2368 起 expected tuck=(1056,196) 恒值）。终端态已在 k−1↔s(k) 对中比对过，结局本身由
    // 上面的 outcome 断言。timeout 结局无终幕边界，不跳。
    const skipTerminal = replayed.outcome.status !== "timeout" ? replayed.outcome.frame : -1;
    for (const a of act) {
      if (a.f === skipTerminal) continue;
      const e = expByF.get(a.f + alignShift);
      if (!e) continue; // 头部 N 帧（内核无 Step 前对应）/尾部 oracle 独有帧（行为性时长偏移）
      const out = [];
      diffInto(`frames[f${a.f}]`, { ...e, f: a.f }, a, tol, out, acc);
      if (out.length) { firstDivergence = a.f; leaves = out; break; }
    }
    // 对齐模式不另报帧流长度差：头部跳过是采样约定固有，尾部错位已被 outcome 窗口语义承认
  } else {
    const n = Math.min(exp.length, act.length);
    for (let i = 0; i < n; i++) {
      const e = exp[i], a = act[i];
      if (e.f !== a.f) { problems.push(`抽样帧号错位 @idx${i}: 期望 f${e.f} 实际 f${a.f}`); break; }
      const out = [];
      diffInto(`frames[${i}]`, e, a, tol, out, acc);
      if (out.length) { firstDivergence = e.f; leaves = out; break; }
    }
    if (!problems.length && firstDivergence < 0 && exp.length !== act.length && !outcomeOk) {
      problems.push(`帧流长度不一致: 期望 ${exp.length} 实际 ${act.length}（结局帧前内容一致）`);
    }
  }
  if (firstDivergence >= 0) {
    problems.push(`首个发散帧 f${firstDivergence}（${leaves.length} 处不匹配）:\n${fmtLeaves(leaves)}`);
  }
  return { ok: problems.length === 0, problems, maxDev: acc.maxDev, maxDevPath: acc.maxDevPath };
}

// -------------------------------------------------- fixture 目录扫描

/** 扫描 fixtures/<level>/<case>/（含 meta.json 的目录才算 case；levels/ 等其它子树自然跳过） */
function scanCases() {
  const cases = [];
  for (const levelDir of readdirSync(FIXTURES_DIR).sort()) {
    const lp = join(FIXTURES_DIR, levelDir);
    if (!statSync(lp).isDirectory()) continue;
    for (const caseDir of readdirSync(lp).sort()) {
      const cp = join(lp, caseDir);
      let meta;
      try {
        if (!statSync(cp).isDirectory()) continue;
        meta = JSON.parse(readFileSync(join(cp, "meta.json"), "utf8"));
      } catch { continue; } // 无 meta.json 或不可解析 → 不是 fixture case
      cases.push({ level: levelDir, case: caseDir, dir: cp, meta });
    }
  }
  return cases;
}

/** 路线语义指纹（规范化后 sha256；空白差异不影响，语义同 → 指纹同） */
function routeSig(routeDoc) {
  const canon = JSON.stringify({ level: routeDoc.level, tickHz: routeDoc.tickHz, totalFrames: routeDoc.totalFrames, fb: routeDoc.fb, wg: routeDoc.wg });
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

// -------------------------------------------------- 主流程

function main() {
  const args = process.argv.slice(2);
  const filter = argOf(args, "filter", null);
  const update = args.includes("--update");

  let cases = scanCases();
  if (filter) cases = cases.filter((c) => `${c.level}/${c.case}`.includes(filter));
  if (!cases.length) { log(`没有匹配的 fixture case${filter ? `（filter=${filter}）` : ""}；目录 ${FIXTURES_DIR}`); process.exit(1); }

  let pass = 0, fail = 0;
  const fails = [];
  for (const c of cases) {
    const label = `${c.level}/${c.case}`;
    try {
      const routeDoc = JSON.parse(readFileSync(join(c.dir, "route.json"), "utf8"));
      if (routeDoc.level && routeDoc.level !== c.level) throw new Error(`route.level=${routeDoc.level} 与目录 ${c.level} 不符`);
      const sig = routeSig(routeDoc);

      if (update) {
        if (c.meta.source === "oracle") throw new Error("source=oracle 的 case 不支持 --update 重录（--update 产出的是内核回放，会覆盖 oracle 金输出）；重录走 scripts/e2e/oracle/goldcollect.mjs --capture / --build-fixture");
        const { frames, outcome } = replay(c.level, routeDoc, c.meta, c.dir);
        const oldPath = join(c.dir, "expected.json");
        let old = null;
        try { old = JSON.parse(readFileSync(oldPath, "utf8")); } catch { /* 首录 */ }
        const expected = {
          format: EXPECTED_FORMAT,
          level: c.level, case: c.case,
          source: c.meta.source, dtSchedule: c.meta.dtSchedule,
          tolerance: c.meta.tolerance, sampleEvery: c.meta.sampleEvery ?? 1, mechEvery: c.meta.mechEvery ?? 0,
          totalFrames: routeDoc.totalFrames, routeSig: sig,
          outcome, frames,
        };
        mkdirSync(c.dir, { recursive: true });
        writeFileSync(oldPath, JSON.stringify(expected, null, 2) + "\n");
        if (old && old.routeSig && old.routeSig !== sig) {
          log(`[UPDATE] ${label}  ⚠ route 指纹已变（${old.routeSig}→${sig}），基线按新输入重录`);
        } else if (old?.outcome && old.frames) {
          const { problems, maxDev } = compare({ frames, outcome }, old, c.meta.tolerance ?? 0, c.meta);
          log(`[UPDATE] ${label}  重录 ${outcome.status}@f${outcome.frame}，帧 ${frames.length}${problems.length ? `；与旧基线差 ${problems.length} 项（首项：${String(problems[0]).split("\n")[0]}；maxDev=${maxDev}）` : "；与旧基线位级一致"} → 已写 expected.json`);
        } else {
          log(`[UPDATE] ${label}  首录 ${outcome.status}@f${outcome.frame}，帧 ${frames.length} → 已写 expected.json`);
        }
        pass++;
        continue;
      }

      // 比对模式
      let expected = null;
      try { expected = JSON.parse(readFileSync(join(c.dir, "expected.json"), "utf8")); } catch { /* 落到下方报错 */ }
      if (!expected) throw new Error("expected.json 缺失或不可解析（首录请跑 --update）");
      if (expected.format !== EXPECTED_FORMAT) throw new Error(`expected.format=${expected.format}，runner 支持 ${EXPECTED_FORMAT}`);
      if (expected.routeSig && expected.routeSig !== sig) {
        throw new Error(`route 指纹不匹配（基线 ${expected.routeSig} vs 当前 ${sig}）——输入已变而基线未重录，确认有意后跑 --update`);
      }
      const { frames, outcome } = replay(c.level, routeDoc, c.meta, c.dir);
      const r = compare({ frames, outcome }, expected, c.meta.tolerance ?? 0, c.meta);
      if (r.ok) {
        log(`[PASS] ${label}  ${outcome.status}@f${outcome.frame}，抽样 ${frames.length} 帧，maxDev ${r.maxDev}`);
        pass++;
      } else {
        log(`[FAIL] ${label}  ${outcome.status}@f${outcome.frame}，抽样 ${frames.length} 帧，maxDev ${r.maxDev}${r.maxDevPath ? `@${r.maxDevPath}` : ""}`);
        for (const p of r.problems) console.log("  " + p);
        fail++; fails.push(label);
      }
    } catch (e) {
      log(`[FAIL] ${label}  协议/回放错误: ${e.message}`);
      fail++; fails.push(label);
    }
  }

  log(`==== fixture-runner: ${pass} PASS / ${fail} FAIL${fails.length ? `（${fails.join("、")}）` : ""} ====`);
  process.exit(fail ? 1 : 0);
}

main();

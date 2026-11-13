/**
 * `MechanismSmoother` r51 优化的**进程内微基准**（Node，非浏览器）。
 *
 * ## 为什么这个可以用微基准（而 r49 的 bevel 微基准被判无效）
 * r49 撤回的微基准犯的错是：**只测了热循环、漏掉表构建成本与缓存压力，且合成输入
 * 覆盖率假**（真实 39.8% vs 合成 2.1%）。本件的输入是**从真实页面抓下来的调用序列**
 * （`benchmark/results/smoother-ab-*.json` 的 `trace`，或现场 `--capture` 抓取），
 * 覆盖率由真实帧决定；且被测函数是**纯计算**（`Map.get` + 浮点算术），没有"表构建"
 * 之类被漏掉的阶段——上界与下界是同一个东西。
 *
 * ## 仍存在的口径差（写进报告）
 * Node 的 V8 与浏览器的 V8 同版本不保证，且 Node 侧没有渲染栈争抢缓存。所以本件
 * **只能用于判定 A/B 的相对差**，绝对值不迁移到页面口径。这正是 r51 的教训：
 * 单帧亚微秒级段落在浏览器里测不准，必须换进程内批量口径。
 *
 * 用法：
 *   node benchmark/perf-smoother-micro.mjs --trace benchmark/results/smoother-ab-r51-smoother.json
 *   node --import tsx benchmark/perf-smoother-micro.mjs --trace results/x.json --rounds 12
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const TRACE = arg("--trace", join(RESULTS, "trace-r51-smoother.json"));
const ROUNDS = Number(arg("--rounds", "15"));
const argSave = arg("--save", null);
// 每轮把整个 trace 重复 REPEAT 遍：单轮 400 帧×100 次 ≈ 2ms，太短会被量化/GC 主导。
// REPEAT=20 → 单轮 ~40ms，远高于 1ms 级噪声。
const REPEAT = Number(arg("--repeat", "20"));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

if (!existsSync(TRACE)) {
  console.error(`[micro] 缺少真实调用序列：${TRACE}`);
  console.error("  先用 benchmark/perf-smoother-ab.mjs --capture 抓一份（见该件说明）。");
  process.exit(1);
}
const trace = JSON.parse(readFileSync(TRACE, "utf8"));
/** trace: [[ [key,x,y,a,now,delta,snap], ... ] per frame ] */

// ── 两个实现（与 mechSmoothing.ts 现行版 / 改造前版逐字对应）──
const LEAD_MS = 25, STATIC_MS = 80, RATE = 30, MIN_DT_S = 1 / 120, MAX_DT_S = 0.2;
const shortestArc = (d) => ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/** 改造后：同帧 exp 缓存 + 静止快路 */
class New {
  constructor() { this.samples = new Map(); this.out = { x: 0, y: 0, a: 0 }; this.kNow = NaN; this.kDelta = NaN; this.kVal = 0; }
  clear() { this.samples.clear(); this.kNow = NaN; this.kDelta = NaN; this.kVal = 0; }
  rateK(nowMs, deltaMs) {
    if (nowMs === this.kNow && deltaMs === this.kDelta) return this.kVal;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    this.kNow = nowMs; this.kDelta = deltaMs; this.kVal = k;
    return k;
  }
  target(key, x, y, a, nowMs, deltaMs, snapPending) {
    let m = this.samples.get(key);
    if (!m) {
      m = { x, y, a, vx: 0, vy: 0, va: 0, t: nowMs, rx: x, ry: y, ra: a, init: false };
      this.samples.set(key, m);
    }
    if (!m.init || snapPending) {
      m.x = x; m.y = y; m.a = a; m.rx = x; m.ry = y; m.ra = a; m.t = nowMs; m.init = true;
      this.out.x = x; this.out.y = y; this.out.a = a;
      return this.out;
    }
    if (x !== m.x || y !== m.y || a !== m.a) {
      const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, (nowMs - m.t) / 1000));
      m.vx = (x - m.x) / dt; m.vy = (y - m.y) / dt; m.va = shortestArc(a - m.a) / dt;
      m.x = x; m.y = y; m.a = a; m.t = nowMs;
    } else if (nowMs - m.t > STATIC_MS) {
      m.vx = m.vy = m.va = 0; m.t = nowMs;
    }
    if (m.vx === 0 && m.vy === 0 && m.va === 0 && m.rx === m.x && m.ry === m.y && m.ra === m.a) {
      m.rx = m.rx + 0; m.ry = m.ry + 0; m.ra = m.ra + 0;
      this.out.x = m.rx; this.out.y = m.ry; this.out.a = m.ra;
      return this.out;
    }
    const ex = m.x + (m.vx * LEAD_MS) / 1000;
    const ey = m.y + (m.vy * LEAD_MS) / 1000;
    const ea = m.a + (m.va * LEAD_MS) / 1000;
    const k = this.rateK(nowMs, deltaMs);
    m.rx += (ex - m.rx) * k; m.ry += (ey - m.ry) * k; m.ra += shortestArc(ea - m.ra) * k;
    this.out.x = m.rx; this.out.y = m.ry; this.out.a = m.ra;
    return this.out;
  }
}

/** 改造前（参考） */
class Old {
  constructor() { this.samples = new Map(); this.out = { x: 0, y: 0, a: 0 }; }
  clear() { this.samples.clear(); }
  target(key, x, y, a, nowMs, deltaMs, snapPending) {
    let m = this.samples.get(key);
    if (!m) {
      m = { x, y, a, vx: 0, vy: 0, va: 0, t: nowMs, rx: x, ry: y, ra: a, init: false };
      this.samples.set(key, m);
    }
    if (!m.init || snapPending) {
      m.x = x; m.y = y; m.a = a; m.rx = x; m.ry = y; m.ra = a; m.t = nowMs; m.init = true;
      this.out.x = x; this.out.y = y; this.out.a = a;
      return this.out;
    }
    if (x !== m.x || y !== m.y || a !== m.a) {
      const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, (nowMs - m.t) / 1000));
      m.vx = (x - m.x) / dt; m.vy = (y - m.y) / dt; m.va = shortestArc(a - m.a) / dt;
      m.x = x; m.y = y; m.a = a; m.t = nowMs;
    } else if (nowMs - m.t > STATIC_MS) {
      m.vx = m.vy = m.va = 0; m.t = nowMs;
    }
    const ex = m.x + (m.vx * LEAD_MS) / 1000;
    const ey = m.y + (m.vy * LEAD_MS) / 1000;
    const ea = m.a + (m.va * LEAD_MS) / 1000;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    m.rx += (ex - m.rx) * k; m.ry += (ey - m.ry) * k; m.ra += shortestArc(ea - m.ra) * k;
    this.out.x = m.rx; this.out.y = m.ry; this.out.a = m.ra;
    return this.out;
  }
}

const totalCalls = trace.reduce((s, f) => s + f.length, 0);

/**
 * 确定性计数器（不依赖任何计时）：
 *   - Math.exp 调用次数：receiver 替换成计数桩
 *   - 静止快路命中次数
 * 这两项是**确定性事实**，与机器/负载无关，是本轮最硬的证据。
 */
function countExpAndFastPath(Ctor, useFastPath) {
  const realExp = Math.exp;
  let expCalls = 0;
  Math.exp = (v) => { expCalls++; return realExp(v); };
  // 快路命中：包 samples 里第一个对象的 rx 写入？改为直接统计条件
  let fastHits = 0;
  const s = new Ctor();
  const origTarget = s.target.bind(s);
  s.target = function (key, x, y, a, nowMs, deltaMs, snap) {
    const m = this.samples.get(key);
    if (useFastPath && m && m.init && !snap &&
        m.vx === 0 && m.vy === 0 && m.va === 0 &&
        m.rx === m.x && m.ry === m.y && m.ra === m.a) fastHits++;
    return origTarget(key, x, y, a, nowMs, deltaMs, snap);
  };
  for (const f of trace) for (const x of f) s.target(...x);
  Math.exp = realExp;
  return { expCalls, fastHits };
}
const cntNew = countExpAndFastPath(New, true);
const cntOld = countExpAndFastPath(Old, false);
const perFrame = (v) => (v / trace.length).toFixed(2);
console.log(`\nMechanismSmoother 进程内微基准`);
console.log(`  输入：${trace.length} 真实帧 / ${totalCalls} 次调用（${(totalCalls / trace.length).toFixed(1)} 次/帧）`);

// 逐位一致性（回放一次全序列）
{
  const a = new New(), b = new Old();
  let bad = 0;
  for (const f of trace) for (const args of f) {
    const ga = a.target(...args), gb = b.target(...args);
    if (!Object.is(ga.x, gb.x) || !Object.is(ga.y, gb.y) || !Object.is(ga.a, gb.a)) bad++;
  }
  if (bad) { console.error(`  ✗ 逐位不一致 ${bad} 处`); process.exit(1); }
  console.log(`  逐位一致 ✓`);

console.log(`\n  ── 确定性计数（与机器/负载无关）──`);
console.log(`  Math.exp 调用      旧 ${cntOld.expCalls.toLocaleString().padStart(8)}（${perFrame(cntOld.expCalls)}/帧）   →   新 ${cntNew.expCalls.toLocaleString().padStart(8)}（${perFrame(cntNew.expCalls)}/帧）  ${((1 - cntNew.expCalls / cntOld.expCalls) * 100).toFixed(1)}%↓`);
console.log(`  静止快路命中       新 ${cntNew.fastHits.toLocaleString()}（${perFrame(cntNew.fastHits)}/帧 = ${((cntNew.fastHits / totalCalls) * 100).toFixed(1)}% 的调用）`);
}

const tNew = [], tOld = [];
// 预热
{ const a = new New(), b = new Old(); for (let r = 0; r < 3; r++) { for (const f of trace) { for (const x of f) a.target(...x); for (const x of f) b.target(...x); } } }

const run = (Ctor) => {
  const s = new Ctor();
  const t0 = performance.now();
  for (let rep = 0; rep < REPEAT; rep++) {
    for (const f of trace) for (const x of f) s.target(...x);
    s.clear(); // 每遍复位，保证起点状态一致（clear 本身两臂同构）
  }
  return ((performance.now() - t0) / (trace.length * REPEAT)) * 1000;
};

for (let r = 0; r < ROUNDS; r++) {
  // 交替半轮，抵消 JIT/GC 漂移
  if (r % 2 === 0) { tNew.push(run(New)); tOld.push(run(Old)); }
  else { tOld.push(run(Old)); tNew.push(run(New)); }
}

const mN = med(tNew), mO = med(tOld);
const d = ((mN - mO) / mO) * 100;
const sep = pct(tNew, 0.75) < pct(tOld, 0.25) || pct(tOld, 0.75) < pct(tNew, 0.25);

console.log(`\n  ${ROUNDS} 轮 × ${REPEAT} 遍全 trace（单轮 ${(trace.length*REPEAT).toLocaleString()} 帧）`);
console.log(`  臂                中位(µs/帧)   P25–P75      区间`);
console.log(`  新（快路+缓存）  ${mN.toFixed(2).padStart(10)}   ${pct(tNew,0.25).toFixed(2)}–${pct(tNew,0.75).toFixed(2)}`.padEnd(48) + `  ${Math.min(...tNew).toFixed(2)}–${Math.max(...tNew).toFixed(2)}`);
console.log(`  旧（参考）       ${mO.toFixed(2).padStart(10)}   ${pct(tOld,0.25).toFixed(2)}–${pct(tOld,0.75).toFixed(2)}`.padEnd(48) + `  ${Math.min(...tOld).toFixed(2)}–${Math.max(...tOld).toFixed(2)}`);
console.log(`\n  Δ ${d.toFixed(1)}%（新 − 旧）  ${sep ? "区间不重叠 → 可主张" : "区间重叠 → 带内，不主张"}`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `smoother-micro-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), trace: TRACE, frames: trace.length, calls: totalCalls,
    rounds: ROUNDS, repeat: REPEAT, medNew: +mN.toFixed(3), medOld: +mO.toFixed(3), deltaPct: +d.toFixed(1),
    separated: sep, newSeries: tNew.map((x) => +x.toFixed(3)), oldSeries: tOld.map((x) => +x.toFixed(3)),
  }, null, 1));
  console.log(`\n[micro] 快照已存 ${f}`);
}

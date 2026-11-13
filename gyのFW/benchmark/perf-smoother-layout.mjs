/**
 * `MechanismSmoother` **数据布局重写的信号预估**（r54 新增，进程内回放）。
 *
 * ## 为什么存在
 * r51/r53 反复挂账：`updateMechs` 进一步优化的方向是数据布局（把 100 个散落的
 * Map 样本收成连续存储），r53 定了裁决线——**整帧消融分辨率 ±5–7µs 下，期望
 * 信号须 ≥15µs 才可干净判定**。本件先在进程内预估这条信号，再决定做不做结构
 * 级重写（避免为一个注定不可判的改动动产线代码）。
 *
 * ## 四臂括弧设计
 *   - Old    r51 改造前参考实现（锚点）
 *   - New    现行实现（exp 缓存 + 静止快路），**位级基准**
 *   - Arr    槽位布局原型：每帧按调用序位取样本（`slots[pos].key === key` 校验），
 *            miss 才走 key→槽位 Map；`beginFrame()` 复位游标（重写需加的接口）
 *   - NoMap  收益**天花板**：纯位置存取、无任何校验——假设帧内调用序与槽位完全
 *            稳定（真实系统不成立，只用于把「Map.get 到底占多少」封顶）
 *
 * ## 口径（r51 纪律）
 * 进程内数字只用于 A/B 相对差与信号预估；折算整帧用 r53 实测的放大系数
 * （进程内 3.3µs vs 页内消融 32.9µs ≈ 10×）。位级一致性先于一切计时。
 *
 * 用法：
 *   node benchmark/perf-smoother-layout.mjs --trace benchmark/results/trace-r51-smoother.json --save r54-layout
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const TRACE = arg("--trace", join(RESULTS, "trace-r51-smoother.json"));
const ROUNDS = Number(arg("--rounds", "15"));
const REPEAT = Number(arg("--repeat", "20"));
const argSave = arg("--save", null);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

if (!existsSync(TRACE)) {
  console.error(`[layout] 缺少真实调用序列：${TRACE}（用 perf-smoother-ab.mjs --capture 抓取）`);
  process.exit(1);
}
const trace = JSON.parse(readFileSync(TRACE, "utf8"));

const LEAD_MS = 25, STATIC_MS = 80, RATE = 30, MIN_DT_S = 1 / 120, MAX_DT_S = 0.2;
const shortestArc = (d) => ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/** r51 改造前（参考锚点） */
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

/** 现行实现（位级基准） */
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

/** 槽位布局原型：位置命中 + key 校验，miss 走 Map 兜底 */
class Arr {
  constructor() { this.slots = []; this.byKey = new Map(); this.pos = 0; this.armed = false; this.out = { x: 0, y: 0, a: 0 }; this.kNow = NaN; this.kDelta = NaN; this.kVal = 0; }
  beginFrame() { this.pos = 0; this.armed = true; }
  clear() { this.slots.length = 0; this.byKey.clear(); this.pos = 0; this.armed = false; this.kNow = NaN; this.kDelta = NaN; this.kVal = 0; }
  rateK(nowMs, deltaMs) {
    if (nowMs === this.kNow && deltaMs === this.kDelta) return this.kVal;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    this.kNow = nowMs; this.kDelta = deltaMs; this.kVal = k;
    return k;
  }
  target(key, x, y, a, nowMs, deltaMs, snapPending) {
    let m = this.armed ? this.slots[this.pos] : undefined;
    if (!m || m.key !== key) {
      const i = this.byKey.get(key);
      if (i !== undefined && this.slots[i] && this.slots[i].key === key) m = this.slots[i];
      else {
        m = { key, x, y, a, vx: 0, vy: 0, va: 0, t: nowMs, rx: x, ry: y, ra: a, init: false };
        this.slots[this.pos] = m;
        this.byKey.set(key, this.pos);
      }
    }
    this.pos++;
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

/** 天花板：纯位置存取（不校验 key，不建 Map）——仅用于封顶 Map.get 占比 */
class NoMap {
  constructor() { this.slots = []; this.pos = 0; this.armed = false; this.out = { x: 0, y: 0, a: 0 }; this.kNow = NaN; this.kDelta = NaN; this.kVal = 0; }
  beginFrame() { this.pos = 0; this.armed = true; }
  clear() { this.slots.length = 0; this.pos = 0; this.armed = false; this.kNow = NaN; this.kDelta = NaN; this.kVal = 0; }
  rateK(nowMs, deltaMs) {
    if (nowMs === this.kNow && deltaMs === this.kDelta) return this.kVal;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    this.kNow = nowMs; this.kDelta = deltaMs; this.kVal = k;
    return k;
  }
  target(key, x, y, a, nowMs, deltaMs, snapPending) {
    let m = this.slots[this.pos];
    if (!m) { m = { key, x, y, a, vx: 0, vy: 0, va: 0, t: nowMs, rx: x, ry: y, ra: a, init: false }; this.slots[this.pos] = m; }
    this.pos++;
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

const totalCalls = trace.reduce((s, f) => s + f.length, 0);
console.log(`\nMechanismSmoother 数据布局信号预估`);
console.log(`  输入：${trace.length} 真实帧 / ${totalCalls} 次调用（${(totalCalls / trace.length).toFixed(1)} 次/帧）`);

// ── 位级一致性（Arr/NoMap 对 New；NoMap 只在 trace 顺序稳定时成立）──
{
  const ref = new New(), arr = new Arr(), nm = new NoMap();
  let badA = 0, badN = 0;
  for (const f of trace) {
    arr.beginFrame(); nm.beginFrame();
    for (const args of f) {
      const g = ref.target(...args);
      const ga = arr.target(...args), gn = nm.target(...args);
      if (!Object.is(ga.x, g.x) || !Object.is(ga.y, g.y) || !Object.is(ga.a, g.a)) badA++;
      if (!Object.is(gn.x, g.x) || !Object.is(gn.y, g.y) || !Object.is(gn.a, g.a)) badN++;
    }
  }
  console.log(`  位级一致性：Arr 对 New ${badA ? "✗ " + badA + " 处不一致" : "✓ 0 不一致"}；NoMap 对 New ${badN ? "✗ " + badN + " 处（帧内调用序有漂移，天花板口径照常成立）" : "✓"}`);
  if (badA) process.exit(1);
}

// ── 槽位命中统计（确定性）──
{
  const arr = new Arr();
  let calls = 0, fastSlot = 0;
  const origTarget = arr.target.bind(arr);
  arr.target = function (key, x, y, a, nowMs, deltaMs, snap) {
    calls++;
    const m = this.armed ? this.slots[this.pos] : undefined;
    if (m && m.key === key) fastSlot++;
    return origTarget(key, x, y, a, nowMs, deltaMs, snap);
  };
  for (const f of trace) { arr.beginFrame(); for (const x of f) arr.target(...x); }
  console.log(`  Arr 槽位直中率：${((fastSlot / calls) * 100).toFixed(1)}%（${fastSlot}/${calls}）——确定性事实`);
}

const ARMS = [
  ["New（现状 Map）", New, false],
  ["Arr（槽位+校验）", Arr, true],
  ["NoMap（天花板）", NoMap, true],
  ["Old（参考锚点）", Old, false],
];

// 预热
for (const [, C, needFrame] of ARMS) {
  const s = new C();
  for (let r = 0; r < 3; r++) for (const f of trace) { if (needFrame) s.beginFrame?.(); for (const x of f) s.target(...x); s.clear(); }
}

const series = ARMS.map(() => []);
const run = (C, needFrame) => {
  const s = new C();
  const t0 = performance.now();
  for (let rep = 0; rep < REPEAT; rep++) {
    for (const f of trace) { if (needFrame) s.beginFrame?.(); for (const x of f) s.target(...x); }
    s.clear();
  }
  return ((performance.now() - t0) / (trace.length * REPEAT)) * 1000;
};

for (let r = 0; r < ROUNDS; r++) {
  // 轮内臂序随轮次反交替，抵消 JIT/GC 漂移
  const order = r % 2 === 0 ? ARMS.map((_, i) => i) : ARMS.map((_, i) => ARMS.length - 1 - i);
  for (const i of order) series[i].push(run(ARMS[i][1], ARMS[i][2]));
}

console.log(`\n  ${ROUNDS} 轮 × ${REPEAT} 遍全 trace（单轮 ${(trace.length * REPEAT).toLocaleString()} 帧）`);
console.log(`  臂                    中位(µs/帧)   P25–P75        区间`);
const medians = [];
for (let i = 0; i < ARMS.length; i++) {
  const t = series[i], m = med(t);
  medians.push(m);
  console.log(`  ${ARMS[i][0].padEnd(18)}  ${m.toFixed(2).padStart(8)}   ${pct(t, 0.25).toFixed(2)}–${pct(t, 0.75).toFixed(2).padEnd(10)}  ${Math.min(...t).toFixed(2)}–${Math.max(...t).toFixed(2)}`);
}

const [mNew, mArr, mNo, mOld] = medians;
const sep = (a, b) => pct(series[a], 0.75) < pct(series[b], 0.25);
// r53 整帧放大系数：进程内 3.3µs ↔ 页内消融 32.9µs ≈ 10×；整帧裁决线 15µs
const AMP = 10, LINE = 15;
const gainArr = mNew - mArr, gainNo = mNew - mNo;
console.log(`\n  进程内信号：Arr −${gainArr.toFixed(2)}µs/帧${sep(1, 0) ? "（分离）" : "（重叠，不主张）"}；天花板 NoMap −${gainNo.toFixed(2)}µs/帧${sep(2, 0) ? "（分离）" : "（重叠）"}`);
console.log(`  整帧预估（×${AMP} 放大系数）：Arr ≈ −${(gainArr * AMP).toFixed(1)}µs，天花板 ≈ −${(gainNo * AMP).toFixed(1)}µs；裁决线 ≥${LINE}µs`);
const verdict = gainNo * AMP < LINE
  ? `判负：连天花板都够不到裁决线，重写不做。`
  : gainArr * AMP >= LINE ? `立项：Arr 实型信号过线，可做结构级重写（需位级差分单测 + trace 回放双验证）。`
  : `缓：天花板过线但实型不过——只有激进变体可达标，按收益/风险再裁。`;
console.log(`  → ${verdict}`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `layout-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), trace: TRACE, frames: trace.length, calls: totalCalls,
    rounds: ROUNDS, repeat: REPEAT, amp: AMP, line: LINE,
    medians: { new: +mNew.toFixed(3), arr: +mArr.toFixed(3), nomap: +mNo.toFixed(3), old: +mOld.toFixed(3) },
    series: series.map((t) => t.map((x) => +x.toFixed(3))),
    verdict,
  }, null, 1));
  console.log(`\n[layout] 快照已存 ${f}`);
}

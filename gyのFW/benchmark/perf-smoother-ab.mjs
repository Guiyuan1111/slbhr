/**
 * `MechanismSmoother` r51 优化的**同页配对 A/B**。
 *
 * ## 为什么不用 `perf-update-ablate` 判定
 * 消融在同一页面里换臂（`S.ablate = ...`），臂间差 34.5µs，噪声底 ±5.5µs —— 够判
 * 方向，但**不够判幅度**：消融 `__smoother` 不只是"去掉平滑"，它让下游视图
 * 不再移动，把脏守卫整条链路的工作量也一起抹掉了（见该件头部「固有局限 1」）。
 *
 * ## 口径：同页、同快照流、逐位耦合
 * 页内把两个实现**并联**在同一个 `GameScene` 上：
 *   - 原 `scene.mechSmoother` 仍旧驱动视图（保证画面与真实帧一致）；
 *   - 另建一个 `MechanismSmoother`（新实现）与一个参考实现（旧代码），
 *     用**同一份** `(key, x, y, a, now, delta, snap)` 喂给两者，交替计时。
 *
 * 这样：
 *   - 输入流完全相同（同一帧同一快照，不是合成数据）；
 *   - 不改变视图状态（噪声不来自下游）；
 *   - 每臂的调用序列一致 → 缓存/分支预测条件对称。
 *
 * 主指标 **µs/帧**（把每帧内所有目标的耗时加起来），次指标为**逐位一致率**。
 * 本件同时断言两者输出 `Object.is` 级相等——不等则直接 exit 1，不给"性能好但不正确"的结论。
 *
 * 用法：
 *   node --import tsx benchmark/perf-smoother-ab.mjs
 *   LEVEL=forest_bonus_2 ROUNDS=200 node --import tsx benchmark/perf-smoother-ab.mjs --save r51-smoother
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3676);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const FRAMES = Number(process.env.FRAMES ?? 300);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    child.stdout.on("data", (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/**
 * 页内：在真实帧里抓取 smoothers 的调用参数，然后对两种实现交替计时。
 *
 * 抓参方式：包真实 `mechSmoother.target`，每帧把参数 push 进 buffer。
 * 采满 N 帧后停止记录（把函数还原），再用**抓到的真实参数序列**回放两臂。
 *
 * 为什么回放而不是边跑边测：边跑边测时每次取时钟都会插进真实帧，污染帧率;
 * 回放的输入是**已验证的真实序列**，且两臂拿到完全相同的序列与帧边界。
 */
const PROBE = `async (frames) => {
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const sm = scene.mechSmoother;
  if (!sm) return { error: "no mechSmoother" };

  // 参考实现（改造前）——逐字复制，与单测里的 SmootherRef 同源
  class Ref {
    constructor() { this.samples = new Map(); this.out = { x: 0, y: 0, a: 0 }; }
    clear() { this.samples.clear(); }
    target(key, x, y, a, nowMs, deltaMs, snapPending) {
      const LEAD_MS = 25, STATIC_MS = 80, RATE = 30, MIN_DT_S = 1/120, MAX_DT_S = 0.2;
      const shortestArc = (d) => ((d + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
      let m = this.samples.get(key);
      if (!m) { m = { x,y,a,vx:0,vy:0,va:0,t:nowMs,rx:x,ry:y,ra:a,init:false }; this.samples.set(key,m); }
      if (!m.init || snapPending) {
        m.x=x; m.y=y; m.a=a; m.rx=x; m.ry=y; m.ra=a; m.t=nowMs; m.init=true;
        this.out.x=x; this.out.y=y; this.out.a=a; return this.out;
      }
      if (x!==m.x || y!==m.y || a!==m.a) {
        const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, (nowMs-m.t)/1000));
        m.vx=(x-m.x)/dt; m.vy=(y-m.y)/dt; m.va=shortestArc(a-m.a)/dt;
        m.x=x; m.y=y; m.a=a; m.t=nowMs;
      } else if (nowMs-m.t > STATIC_MS) { m.vx=m.vy=m.va=0; m.t=nowMs; }
      const ex = m.x + (m.vx*LEAD_MS)/1000;
      const ey = m.y + (m.vy*LEAD_MS)/1000;
      const ea = m.a + (m.va*LEAD_MS)/1000;
      const k = 1 - Math.exp((-RATE*deltaMs)/1000);
      m.rx += (ex-m.rx)*k; m.ry += (ey-m.ry)*k; m.ra += shortestArc(ea-m.ra)*k;
      this.out.x=m.rx; this.out.y=m.ry; this.out.a=m.ra; return this.out;
    }
  }

  // 1) 抓真实调用序列（按帧分组）
  const perFrameArgs = [];
  let cur = null;
  const origTarget = sm.target.bind(sm);
  let capturing = true;
  sm.target = function (key, x, y, a, nowMs, deltaMs, snap) {
    if (capturing) { (cur ??= []).push([key, x, y, a, nowMs, deltaMs, snap]); }
    return origTarget(key, x, y, a, nowMs, deltaMs, snap);
  };
  const origMech = scene.updateMechs;
  scene.updateMechs = function (st, n, d) {
    cur = [];
    const r = origMech.call(this, st, n, d);
    if (capturing && cur.length) perFrameArgs.push(cur);
    cur = null;
    if (capturing && perFrameArgs.length >= frames) capturing = false;
    return r;
  };

  const dl = performance.now() + 60000;
  while (performance.now() < dl && capturing) await new Promise((r) => setTimeout(r, 50));
  sm.target = origTarget;
  scene.updateMechs = origMech;
  if (!perFrameArgs.length) return { error: "未抓到参数" };

  // 2) 回放两臂。半轮交替（A,B,A,B…）以抵消漂移
  const NewSmoother = sm.constructor;
  const armA = new NewSmoother();
  const armB = new Ref();
  let mismatch = 0, firstMismatch = null;

  for (const args of perFrameArgs) {
    // 逐位一致性（与计时分开做，避免混入）
    for (const a of args) {
      const ga = armA.target(...a), gb = armB.target(...a);
      if (!Object.is(ga.x, gb.x) || !Object.is(ga.y, gb.y) || !Object.is(ga.a, gb.a)) {
        mismatch++;
        if (!firstMismatch) firstMismatch = { key: a[0], got: [ga.x, ga.y, ga.a], exp: [gb.x, gb.y, gb.a] };
      }
    }
    // 计时：两臂各自重跑这一帧（状态已推进，故用独立实例）
  }

  // 计时用全新实例，避免一致性检查已把状态推到末尾。
  //
  // ## 为什么按块计时（这是 r51 踩到的第二个量子化坑）
  // 100 次调用/帧 × 单次 ~0.35µs ≈ 35µs/帧，仍低于 100µs 量子，**单帧读数几乎全是 0**。
  // 首版逐帧计时实测两臂中位都是 0.00µs，判不出任何东西。
  // 改为**块内累计**：一块 BLOCK 帧只取 1 对时钟，两臂按块交替（A,B,A,B…），
  // 块耗时分摊到帧后相对误差 = 100µs / (BLOCK·35µs)。
  const BLOCK = 20;
  const blocks = [];
  for (let i = 0; i < perFrameArgs.length; i += BLOCK) blocks.push(perFrameArgs.slice(i, i + BLOCK));

  const timeA = new NewSmoother(), timeB = new Ref();
  const blockA = [], blockB = [];
  for (const blk of blocks) {
    let t0 = performance.now();
    for (const args of blk) for (const a of args) timeA.target(...a);
    blockA.push(((performance.now() - t0) / blk.length) * 1000); // µs/帧
    t0 = performance.now();
    for (const args of blk) for (const a of args) timeB.target(...a);
    blockB.push(((performance.now() - t0) / blk.length) * 1000);
  }
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const srtA = sorted(blockA), srtB = sorted(blockB);
  const q = (s, p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    frames: perFrameArgs.length,
    callsPerFrame: +(perFrameArgs.reduce((s, a) => s + a.length, 0) / perFrameArgs.length).toFixed(1),
    blockFrames: BLOCK,
    blocks: blocks.length,
    mismatch, firstMismatch,
    A: { med: q(srtA, 0.5), p25: q(srtA, 0.25), p75: q(srtA, 0.75), min: srtA[0], max: srtA[srtA.length - 1] },
    B: { med: q(srtB, 0.5), p25: q(srtB, 0.25), p75: q(srtB, 0.75), min: srtB[0], max: srtB[srtB.length - 1] },
    blockA, blockB, perFrameArgs,
    quantumUs: (() => { let prev = performance.now(), s = Infinity; for (let i = 0; i < 5000; i++) { const t = performance.now(); const d = t - prev; if (d > 0 && d < s) s = d; prev = t; } return s * 1000; })(),
  };
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
let res;
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  try {
    const code = await enterAs(page, PORT, "create", "", LEVEL);
    await enterAs(pageB, PORT, "join", code, LEVEL);
    await waitForStarted(page, 30000);
    await waitForStarted(pageB, 30000);
    res = await page.evaluate(`(${PROBE})(${FRAMES})`);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!res || res.error) { console.error("[smoother-ab] 失败:", res?.error ?? "无结果"); process.exit(1); }
if (res.mismatch > 0) {
  console.error(`[smoother-ab] ✗ 逐位不一致 ${res.mismatch} 处，首个：`, res.firstMismatch);
  process.exit(1);
}

const argCapture = process.argv.includes("--capture");

if (argCapture) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `trace-${typeof argCapture === "string" ? argCapture : "r51-smoother"}.json`);
  writeFileSync(f, JSON.stringify(res.perFrameArgs));
  console.log(`\n[smoother-ab] 真实调用序列已导出 ${f}（${res.perFrameArgs.length} 帧）`);
  console.log(`  下一步：node benchmark/perf-smoother-micro.mjs --trace ${f}`);
  process.exit(0);
}

const us = (ms) => (ms * 1000).toFixed(2); // 兼容旧字段（ms→µs），块计时臂已是 µs 直接用
const dPct = ((res.A.med - res.B.med) / res.B.med) * 100;
console.log(`\nMechanismSmoother 配对 A/B（${LEVEL}，${res.frames} 真实帧，${res.callsPerFrame} 次/帧）`);
console.log(`  块计时：${res.blocks} 块 × ${res.blockFrames} 帧/块；量化粒度 ${res.quantumUs.toFixed(0)} µs；逐位一致 ✓（${res.mismatch} 处不一致）\n`);
console.log("  臂                     中位(µs/帧)   P25–P75(µs)   块区间(µs)");
console.log(`  新（r51 快路+exp 缓存） ${res.A.med.toFixed(2).padStart(9)}   ${res.A.p25.toFixed(2)}–${res.A.p75.toFixed(2)}`.padEnd(50) + `  ${res.A.min.toFixed(2)}–${res.A.max.toFixed(2)}`);
console.log(`  旧（参考实现）          ${res.B.med.toFixed(2).padStart(9)}   ${res.B.p25.toFixed(2)}–${res.B.p75.toFixed(2)}`.padEnd(50) + `  ${res.B.min.toFixed(2)}–${res.B.max.toFixed(2)}`);
console.log(`\n  Δ ${dPct.toFixed(1)}%（新 − 旧，负=新更快）`);

// 区间分离判定：新臂的 P75 是否低于旧臂 P25（分布级分离，非极值）
const separated = res.A.p75 < res.B.p25;
console.log(`  分布分离（新P75 ${res.A.p75.toFixed(2)} < 旧P25 ${res.B.p25.toFixed(2)}）：${separated ? "是 → 可主张" : "否 → 带内，不主张"}`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `smoother-ab-${argSave}.json`);
  writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), level: LEVEL, frames: FRAMES, result: res, deltaPct: +dPct.toFixed(1), separated }, null, 1));
  console.log(`\n[smoother-ab] 快照已存 ${f}`);
}

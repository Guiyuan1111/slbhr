/**
 * 页内确定性计数：`MechanismSmoother` 的 `Math.exp` 调用次数（r51 新增）。
 *
 * ## 为什么需要
 * 本环境 `performance.now()` 量化到 100 µs，而 `MechanismSmoother` 单次调用
 * ~0.05µs —— **页内计时对该改动完全失明**（实测两臂逐帧中位都是 0.00）。
 *
 * 但改动的**机制**是确定的：`k = 1 - exp(-RATE·Δ/1000)` 从「每次调用算一次」
 * 变成「每帧算一次」。这个次数**与机器无关、与负载无关**，可以精确计数。
 *
 * ## 口径
 * 在真实开局页面上替换 `Math.exp` 为计数桩，跑 N 个真实帧，得到：
 *   `Math.exp 次数 / 帧`、`smoother 调用次数 / 帧`
 * 两者之比就是该改动的**确定性收益**（不是统计推断）。
 *
 * ⚠ **全局 exp 计数会被别处污染**：首次实测得到 102 次/帧而非 1——因为
 * `GameScene.ts:1967` 的相机收敛每帧也调 2 次 exp（双角色，`rate` 40/20 各一）。
 * 所以本件把 `Math.exp` 计数桩**只装在 smoother 调用窗口内**（包 `sm.target`
 * 的进入/退出），窗口外一律不计。
 *
 * 改前的次数按「调用次数」直接算出（旧实现每次调用必调一次 exp），
 * 所以 A 臂不需要真的回退代码——件内断言：**新实现的 exp 次数必须 ≈ 帧数**。
 *
 * 用法：
 *   node --import tsx benchmark/perf-exp-count.mjs
 *   LEVEL=forest_bonus_2 FRAMES=300 node --import tsx benchmark/perf-exp-count.mjs --save r51-expcount
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3678);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const FRAMES = Number(process.env.FRAMES ?? 300);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;

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

const PROBE = `async (frames) => {
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const sm = scene.mechSmoother;
  if (!sm) return { error: "no smoother" };

  // exp 计数桩**只在 smoother 窗口内开启**——窗口外的 exp（相机收敛 2/帧）不计入
  const realExp = Math.exp;
  let expCalls = 0;

  // smoother 调用计数 + 快路命中计数
  let calls = 0, fastHits = 0;
  const origTarget = sm.target.bind(sm);
  sm.target = function (key, x, y, a, nowMs, deltaMs, snap) {
    calls++;
    const m = this.samples.get(key);
    if (m && m.init && !snap && m.vx === 0 && m.vy === 0 && m.va === 0 &&
        m.rx === m.x && m.ry === m.y && m.ra === m.a) fastHits++;
    Math.exp = function (v) { expCalls++; return realExp(v); };
    try { return origTarget(key, x, y, a, nowMs, deltaMs, snap); }
    finally { Math.exp = realExp; }
  };

  // 帧计数：只统计 started 且 levelId 匹配的帧（与 update 的闸一致）
  let framesSeen = 0;
  const origUpdate = scene.update;
  let finished = false;
  const wrapped = function (t, d) {
    const st = this.d?.net?.room?.state;
    if (st && String(st.phase ?? "") === "started" && String(st.levelId ?? "") === this.d.level.id) {
      framesSeen++;
      if (framesSeen >= frames && !finished) { finished = true; }
    }
    return origUpdate.call(this, t, d);
  };
  scene.update = wrapped;
  if (scene.sys) scene.sys.sceneUpdate = wrapped;

  const dl = performance.now() + 120000;
  while (performance.now() < dl && !finished) await new Promise((r) => setTimeout(r, 20));

  // 还原
  Math.exp = realExp;
  sm.target = origTarget;
  scene.update = origUpdate;
  if (scene.sys) scene.sys.sceneUpdate = origUpdate;

  if (!framesSeen) return { error: "未采到帧" };
  return { frames: framesSeen, calls, fastHits, expCalls };
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

if (!res || res.error) { console.error("[expcount] 失败:", res?.error ?? "无结果"); process.exit(1); }

const perFrame = (v) => (v / res.frames).toFixed(2);
const oldExp = res.calls; // 旧实现每次 target 调一次 exp
const saved = oldExp - res.expCalls;
console.log(`\n页内确定性计数（${LEVEL}，${res.frames} 个真实 started 帧）\n`);
console.log(`  smoother 调用          ${res.calls.toLocaleString().padStart(9)}   ${perFrame(res.calls)}/帧`);
console.log(`  静止快路命中           ${res.fastHits.toLocaleString().padStart(9)}   ${perFrame(res.fastHits)}/帧  (${((res.fastHits / res.calls) * 100).toFixed(1)}%)`);
console.log(`\n  Math.exp 调用`);
console.log(`    改造前（= 调用次数） ${oldExp.toLocaleString().padStart(9)}   ${perFrame(oldExp)}/帧`);
console.log(`    改造后（实测）       ${res.expCalls.toLocaleString().padStart(9)}   ${perFrame(res.expCalls)}/帧`);
console.log(`    → 减少 ${saved.toLocaleString()} 次（−${((saved / oldExp) * 100).toFixed(1)}%）`);

// 断言：新实现每帧 exp 次数应 ≈1（不是每调用一次）
const perFrameExp = res.expCalls / res.frames;
const ok = perFrameExp <= 1.02;
console.log(`\n  ${ok ? "✓" : "✗"} 每帧 exp 次数 ${perFrameExp.toFixed(3)} ${ok ? "≈1，符合「每帧一次」预期" : ">1.02，缓存可能未生效"}`);
if (!ok) process.exitCode = 1;

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `expcount-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, frames: res.frames,
    smootherCalls: res.calls, fastPathHits: res.fastHits,
    expBefore: oldExp, expAfter: res.expCalls, savedPct: +((saved / oldExp) * 100).toFixed(1),
    callsPerFrame: +(res.calls / res.frames).toFixed(2),
    expPerFrameBefore: +(oldExp / res.frames).toFixed(2),
    expPerFrameAfter: +perFrameExp.toFixed(3),
    fastPathRate: +((res.fastHits / res.calls) * 100).toFixed(1),
  }, null, 1));
  console.log(`\n[expcount] 快照已存 ${f}`);
}

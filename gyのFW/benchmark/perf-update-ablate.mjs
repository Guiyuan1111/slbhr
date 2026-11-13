/**
 * `GameScene.update` 各段**消融成本**（r51 新增）。
 *
 * ## 为什么需要（这是 r51 的核心量具发现）
 * r50 的 `perf-update.mjs` 在**每个方法**前后各取一次 `performance.now()`。本环境
 * （headless Chromium，非 crossOriginIsolated）的 `performance.now()` 量化到
 * **100 µs**（实测：20000 次调用只出现 0.1ms 一个非零差值）。
 *
 * 于是：
 *   - `updateMechs`（167.5µs/帧）信号 » 量子 → 逐帧相对误差 ~2%，**可信**；
 *   - `updatePlatformSound`（r50 报 40.5–48µs/帧）单次真实成本 **< 2µs** ≪ 量子
 *     → 每帧读数只有 0 或 100 两档，除以帧数得到的"均值"由**撞上 tick 的比例**决定，
 *     不是耗时。r51 用批量计时实测该段真值 **1.34 µs/帧**（见 `perf-plat-pass`），
 *     r50 的 48µs 高了约 36 倍。
 *
 * **结论：逐回调打点只能用于「大段」，不能用于「亚微秒段」。** 本件换用消融法。
 *
 * ## 口径：消融（ablation）
 * 不测「段内耗时」，测「把段拿掉后整帧少了多少」：
 *   A 臂 = 真实 `update`，B 臂 = 把目标方法换成空桩后的 `update`，
 *   两臂交替 N 轮，每轮累计 TOTAL_FRAMES 帧的整帧耗时。
 *   段成本 = A 中位 − B 中位。
 *
 * 为什么这样可信：整帧 ~270µs 是**信号 > 量子**的量，单帧误差 ±100µs，
 * 累计 200 帧后 SE ≈ 100/√200 ≈ 7µs（整帧的 2.6%）；两臂配对后更小。
 *
 * ## 消融的固有局限（必须写进报告）
 * 1. **会改变下游工作量**：如消融 `updateMechs` 后机关视图不再移动，Phaser 的
 *    脏检查让后续 `setPosition` 变便宜——所以消融值是该段成本的**上界估计**，
 *    不是精确分解。方向性判断（谁大谁小）可靠，绝对分配不可靠。
 * 2. **不能消融有跨段副作用的段**：`updatePlayers` 提供 `pFb/pWg`（`update` 里直接取，
 *    不在段内）、`drainSfx` 与 `snapPending` 归零都影响后续帧。本件仍对
 *    `updatePlayers` 做消融，但标注为参考值。
 * 3. 消融期间视图可能停摆 → 每轮结束必须恢复原方法（本件 `finally` 保证）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-update-ablate.mjs
 *   LEVEL=forest_bonus_2 ROUNDS=6 TOTAL_FRAMES=200 node --import tsx benchmark/perf-update-ablate.mjs --save r51-ablate
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3674);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const TOTAL_FRAMES = Number(process.env.TOTAL_FRAMES ?? 200);
const ROUNDS = Number(process.env.ROUNDS ?? 6);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * 参与消融的段。`control` 是**噪声底对照**：消融一个空方法，
 * 若它测出非零成本，说明本件的分辨率/漂移就有这么大。
 *
 * `MECH_MODE=1` 时改为逐**机关类回调**消融（定位 updateMechs 内部的 122µs），
 * 另加两个结构性消融臂：
 *   - `__smoother`：`mechSmoother.target` 直接返回常量（整条平滑管线归零）
 *   - `__views`：把回调全换空桩（只留 16 趟遍历骨架）
 */
const MECH_MODE = process.env.MECH_MODE === "1";

/**
 * `ABLATE_TARGETS=__smoother` 可只跑指定臂（消融很慢：每臂 200 帧 × N 轮 × 双臂）。
 * r51 收敛用法：只比 `__baseline` 与 `__smoother` 两臂，把轮数堆上去换分辨率。
 */
const TARGETS = process.env.ABLATE_TARGETS
  ? process.env.ABLATE_TARGETS.split(",").map((s) => s.trim()).filter(Boolean)
  : MECH_MODE
    ? ["cbPlatforms", "cbProps", "cbPushers", "cbLevers", "cbPulleys", "__smoother", "__views"]
    : ["updateMechs", "updatePlatformSound", "updateNavies", "updatePlayers"];

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
 * 页内：装一个可切换的消融开关。
 *
 * 关键：**包原型方法**（`updateMechs` 等是 `this.xxx()` 调的原型方法，r50 已验证
 * 包原型有效）。每帧只由外层 `update` 包一次计时，不在段内取时钟——
 * 这正是本件与 r50 口径的分水岭。
 */
const HOOK = `(() => {
  window.__ab = { ablate: null, frames: 0, totalMs: 0, running: false, done: false };
  const S = window.__ab;
  const wrap = () => {
    const g = window.__fw;
    if (!g) return false;
    const scene = g.scene.getScene("Game");
    if (!scene || scene.__abHooked) return true;
    scene.__abHooked = true;
    const proto = Object.getPrototypeOf(scene);

    // 每个目标方法：包一层，ablate 命中时直接返回（不执行原逻辑）
    const targets = ${JSON.stringify(TARGETS)};
    S.saved = {};
    targets.forEach((name) => {
      if (name === "__smoother" || name === "__views") return; // 结构性臂单独处理
      const orig = proto[name];
      if (typeof orig !== "function") return;
      S.saved[name] = orig;
      proto[name] = function (...a) {
        if (S.ablate === name) return;
        return orig.apply(this, a);
      };
    });

    // 结构性臂 __smoother：产线平滑管线整体归零（返回固定位姿）
    const sm = scene.mechSmoother;
    if (sm && typeof sm.target === "function") {
      S.savedSmoother = sm.target.bind(sm);
      const out = { x: 0, y: 0, a: 0 };
      sm.target = function (key, x, y, a) {
        if (S.ablate === "__smoother") { out.x = x; out.y = y; out.a = a; return out; }
        return S.savedSmoother(key, x, y, a, arguments[4], arguments[5], arguments[6]);
      };
    }

    // 结构性臂 __views：全部机关回调换空桩，只保留 updateMechs 的 16 趟遍历
    S.savedViews = {};
    const cbNames = ${JSON.stringify(["cbLevers","cbPushers","cbPlatforms","cbProps","cbWinds","cbHangings","cbPulleys","cbRomans","cbBeamers","cbRotMirrors","cbBoxMirrors","cbInfiniteMirrors","cbLightPushers","cbSliders","cbTimedPushers"])};
    cbNames.forEach((name) => {
      const orig = scene[name];
      if (typeof orig !== "function") return;
      S.savedViews[name] = orig;
      scene[name] = function (...a) {
        if (S.ablate === "__views") return;
        return orig.apply(this, a);
      };
    });

    // 噪声底对照：消融一个不做任何事的空方法
    proto.__ablateNoop = function () {};
    S.saved.__ablateNoop = proto.__ablateNoop;
    proto.__ablateNoop = function () { if (S.ablate === "__noop") return; };

    const origUpdate = scene.update;
    const wrapped = function (time, delta) {
      const st = this.d && this.d.net && this.d.net.room && this.d.net.room.state;
      const started = st && String(st.phase ?? "") === "started";
      if (!S.running || !started) return origUpdate.call(this, time, delta);
      const t0 = performance.now();
      try { return origUpdate.call(this, time, delta); }
      finally {
        S.totalMs += performance.now() - t0;
        S.frames++;
        if (S.frames >= S.target) { S.running = false; S.done = true; }
      }
    };
    scene.update = wrapped;
    if (scene.sys) scene.sys.sceneUpdate = wrapped;
    return true;
  };
  if (!wrap()) {
    const t = setInterval(() => { if (wrap()) clearInterval(t); }, 20);
    window.__abStopPoll = () => clearInterval(t);
  }
  return true;
})()`;

/** 跑一臂：设定消融目标，累计 target 帧整帧耗时 */
const RUN_ARM = `async ({ ablate, target }) => {
  const S = window.__ab;
  S.ablate = ablate; S.frames = 0; S.totalMs = 0; S.done = false; S.target = target;
  const g = window.__fw;
  const dl = performance.now() + 30000;
  while (performance.now() < dl) {
    const st = g.scene.getScene("Game")?.d?.net?.room?.state;
    if (st && String(st.phase ?? "") === "started") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const st0 = g.scene.getScene("Game")?.d?.net?.room?.state;
  if (!st0 || String(st0.phase ?? "") !== "started") return { error: "未进入 started" };
  S.running = true;
  const deadline = performance.now() + 180000;
  while (performance.now() < deadline && !S.done) await new Promise((r) => setTimeout(r, 20));
  S.running = false;
  if (!S.done) return { error: "帧数不足", got: S.frames };
  return { frames: S.frames, perFrameUs: +((S.totalMs / S.frames) * 1000).toFixed(3) };
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const rows = [];
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
    await page.evaluate(HOOK);

    const arms = ["__baseline", "__noop", ...TARGETS];
    for (let r = 0; r < ROUNDS; r++) {
      // 每轮内：基线 → 各消融臂 → 基线（首尾基线可看漂移）
      for (const arm of [...arms, "__baseline"]) {
        const ablate = arm === "__baseline" ? null : arm === "__noop" ? "__noop" : arm;
        const res = await page.evaluate(`(${RUN_ARM})(${JSON.stringify({ ablate, target: TOTAL_FRAMES })})`);
        if (res?.error) { console.log("[ablate] 轮", r, arm, "跳过:", res.error); continue; }
        rows.push({ round: r, arm, perFrameUs: res.perFrameUs, frames: res.frames });
      }
    }
    // 恢复（页面即将关闭，但保持卫生）
    await page.evaluate(() => {
      window.__abStopPoll?.();
      const S = window.__ab;
      const scene = window.__fw.scene.getScene("Game");
      if (S?.saved) { const p = Object.getPrototypeOf(scene); for (const [k, v] of Object.entries(S.saved)) p[k] = v; }
      if (S?.savedViews) for (const [k, v] of Object.entries(S.savedViews)) scene[k] = v;
      if (S?.savedSmoother && scene.mechSmoother) scene.mechSmoother.target = S.savedSmoother;
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!rows.length) { console.error("[ablate] 无有效样本"); process.exit(1); }

const byArm = new Map();
for (const r of rows) {
  if (!byArm.has(r.arm)) byArm.set(r.arm, []);
  byArm.get(r.arm).push(r.perFrameUs);
}
const baseline = byArm.get("__baseline") ?? [];
const baseMed = med(baseline);
const iqr = (a) => { const s = [...a].sort((x, y) => x - y); return [s[Math.floor(s.length * 0.25)], s[Math.floor(s.length * 0.75)]]; };

console.log(`\nGameScene.update 消融成本（${LEVEL}，${ROUNDS} 轮 × ${TOTAL_FRAMES} 帧/臂，仅 started）`);
console.log(`  基线下位整帧：${baseMed.toFixed(1)} µs/帧   区间 [${Math.min(...baseline).toFixed(1)}–${Math.max(...baseline).toFixed(1)}]`);
console.log(`  基线抖动 IQR：${JSON.stringify(iqr(baseline).map((x) => +x.toFixed(1)))} µs\n`);
console.log("  消融目标              该段成本(µs/帧)   占整帧     臂区间(µs)");
const out = [];
for (const arm of ["__noop", ...TARGETS]) {
  const v = byArm.get(arm);
  if (!v || !v.length) continue;
  const m = med(v);
  const cost = baseMed - m;
  out.push({ arm, cost: +cost.toFixed(2), perFrameUs: +m.toFixed(2), min: +Math.min(...v).toFixed(1), max: +Math.max(...v).toFixed(1) });
  const label = arm === "__noop" ? "__noop（噪声底对照）" : arm;
  console.log(`  ${label.padEnd(22)} ${cost.toFixed(1).padStart(10)}   ${((cost / baseMed) * 100).toFixed(1).padStart(6)}%   [${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)}]`);
}
const noiseFloor = out.find((o) => o.arm === "__noop");
if (noiseFloor) {
  console.log(`\n  ⚠ 噪声底对照 __noop 测出 ${noiseFloor.cost.toFixed(1)} µs——`);
  console.log(`    小于该值的段成本不可主张（本件分辨率约 ±${Math.abs(noiseFloor.cost).toFixed(1)} µs）。`);
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `ablate-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, rounds: ROUNDS, totalFrames: TOTAL_FRAMES,
    baselineMed: +baseMed.toFixed(2), arms: out, rows,
  }, null, 1));
  console.log(`\n[ablate] 快照已存 ${f}`);
}

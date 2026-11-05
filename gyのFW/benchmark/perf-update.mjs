/**
 * GameScene.update 逐帧分段归因（r50 新增）。
 *
 * ## 为什么需要
 * r47 的 `perf-client` 量到「客户端逐帧分配 86.8% 在 Phaser 内部」，但那是**分配**口径；
 * r48 的 `perf-step-cpu` 量的是**服务端**单步。**客户端 `GameScene.update` 内部 13 个
 * 子步骤（角色/钻石/机关/仙女/传送门/浮尘/黑幕/教学…）从未被分解过**——不知道逐帧时间
 * 花在哪一段，任何"优化 update"的尝试都是盲打。
 *
 * ## 口径
 * 页内 `performance.now()` 逐段打点，在 `GameScene.update` 外包一层，把 13 个方法
 * 逐个包计时。全部在页面内完成，不经 CDP（避免序列化开销扭曲短窗口，r48 已实证
 * 剖析器自开销能超过被测窗口）。
 *
 * ## 关键口径坑
 * 1. `update` 每帧都跑（~60fps），单次只有几百 µs。必须累计**大量帧**再取中位，
 *    不能看单帧。本件默认累计 600 帧/轮。
 * 2. headless SwiftShader 的 `present` 阻塞会让 `requestAnimationFrame` 间隔飙到 70ms+。
 *    本件量的是 **update 段自身耗时**（`performance.now()` 前后差），不含 present，
 *    所以不受帧率影响。但帧数会变少 → 采集时长变长。
 * 3. 必须等 `phase === "started"` 再采（ready/won 阶段的 update 走不同分支）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-update.mjs
 *   LEVEL=forest_bonus_2 FRAMES=600 ROUNDS=5 node --import tsx benchmark/perf-update.mjs --save r50-update
 *   node --import tsx benchmark/perf-update.mjs --compare r50-update
 *
 * 环境变量：LEVEL（缺省 forest_bonus_2 —— 结构最重关）、
 *          FRAMES（每轮累计帧数，缺省 600）、ROUNDS（轮数，缺省 5）、PORT（缺省 3671）。
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3671);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "update-pw";
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const FRAMES = Number(process.env.FRAMES ?? 600);
const ROUNDS = Number(process.env.ROUNDS ?? 5);

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const log = (...a) => console.log("[update]", ...a);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/** update 内 13 个可分段子步骤（顺序与 GameScene.update 调用序一致） */
const SEGMENTS = [
  "updatePlayers", "updateDiamonds", "updateMechs", "updateFairies", "updatePortals",
  "flushFairyDrag", "updateDust", "drawDarkness", "updatePlatformSound", "updateTutorial",
  "updateNavies", "drainSfx",
];

/**
 * r51：`updateMechs` 内部按 16 类机关再拆一层。
 *
 * ⚠ 这些 `cbXxx` 是 **create() 期 bind 出来的实例属性**（`GameScene.ts:530-539`），
 * 不是原型方法——必须包实例属性（与 r50 发现的 Phaser `sys.sceneUpdate` 同类陷阱：
 * 包错层级 = 包了个没人调的函数）。灯光族（beamers/rotMirrors/…）是类字段箭头函数，
 * 同样在实例上。
 */
const MECH_CBS = [
  "cbLevers", "cbPushers", "cbPlatforms", "cbProps", "cbWinds", "cbHangings",
  "cbPulleys", "cbRomans", "cbBeamers", "cbRotMirrors", "cbBoxMirrors",
  "cbInfiniteMirrors", "cbLightPushers", "cbSliders", "cbTimedPushers",
  "cbPlatSnd",
];

/**
 * 页内钩子：包 GameScene.update + 12 个分段方法。
 *
 * ## 关键坑（r50 实测，浪费了两轮调试）
 * **包装原型上的 `update` 完全无效。** Phaser 在 `SceneManager.bootScene` 里
 * `sys.sceneUpdate = scene.update`（`node_modules/phaser/src/scene/SceneManager.js:636-638`）
 * —— 这是在 `create()` 结束后**一次性快照**，之后每帧调的是 `sys.sceneUpdate`，
 * 不再走原型链。首版只包 `Object.getPrototypeOf(scene).update`，实测
 * `calls: 0`（包装后的函数一次都没被调用），采集 0 帧。
 *
 * **正确做法**：包装实例自己的 `update`，并把 `sys.sceneUpdate` 重新指向它。
 * 12 个分段方法（`updatePlayers` 等）是在 `update` 内部通过 `this.xxx()` 调的，
 * 走原型链，包原型有效——这两类要分别处理。
 *
 * ⚠ 必须双人开局：`ForestRoom` 要求双人到齐 → ready 2s → started。
 *
 * 只在 `phase === "started"` 时累计，避免 ready/won 分支污染。
 */
const HOOK = `(() => {
  window.__up = { seg: {}, frames: 0, totalMs: 0, running: false, done: false, calls: 0 };
  const S = window.__up;
  const wrap = () => {
    const g = window.__fw;
    if (!g) return false;
    const scene = g.scene.getScene("Game");
    if (!scene || scene.__upHooked) return true;
    const proto = Object.getPrototypeOf(scene);
    if (typeof proto.update !== "function") return false;
    scene.__upHooked = true;

    // 分段方法：走原型链调用，包原型有效
    ${JSON.stringify(SEGMENTS)}.forEach((name) => {
      const orig = proto[name];
      if (typeof orig !== "function") return;
      proto[name] = function (...a) {
        if (!S.running) return orig.apply(this, a);
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally { S.seg[name] = (S.seg[name] || 0) + (performance.now() - t0); }
      };
    });

    // r51：机关类级分解——包**实例属性**（cbXxx 是 create 期 bind 出来的，不在原型上）
    const mechKeys = ${JSON.stringify(MECH_CBS)};
    const mech = {};
    mechKeys.forEach((name) => {
      const orig = scene[name];
      if (typeof orig !== "function") return;
      const key = "mech:" + name;
      mech[name] = true;
      scene[name] = function (...a) {
        if (!S.running) return orig.apply(this, a);
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally { S.seg[key] = (S.seg[key] || 0) + (performance.now() - t0); }
      };
      // 同时记录调用次数（判断该类机关是否存在于本关）
      scene[name].__orig = orig;
    });
    S.mechHooked = Object.keys(mech);

    // update：必须包**实例**并重指 sys.sceneUpdate（Phaser 已快照，原型无效）
    const origUpdate = scene.update;
    const wrapped = function (time, delta) {
      S.calls++;
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
    window.__upStopPoll = () => clearInterval(t);
  }
  return true;
})()`;

/** 开跑：重置计数，等足够帧数 */
const RUN = `async (target) => {
  const S = window.__up;
  S.seg = {}; S.frames = 0; S.totalMs = 0; S.done = false;
  S.target = target;
  // 等进入 started（房间可能还在 ready）
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
  const deadline = performance.now() + 120000;
  while (performance.now() < deadline && !S.done) await new Promise((r) => setTimeout(r, 20));
  if (!S.done) return { error: "帧数不足", got: S.frames };
  window.__upStopPoll?.();
  return { frames: S.frames, totalMs: +S.totalMs.toFixed(3), seg: S.seg };
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let r = 0; r < ROUNDS; r++) {
    // 双人开局（服务端权威双人房：单人进不去 started 相位）
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
      const hooked = await page.evaluate(() => !!window.__fw.scene.getScene("Game")?.__upHooked);
      if (!hooked) { log("轮", r, "钩子未挂上，跳过"); continue; }
      const res = await page.evaluate(`(${RUN})(${FRAMES})`);
      if (res?.error) log("轮", r, "跳过:", res.error, res.got ?? "");
      else rows.push(res);
    } catch (e) {
      log("轮", r, "异常:", String(e).slice(0, 120));
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!rows.length) { console.error("[update] 无有效样本"); process.exit(1); }

/** 逐段换算成「每帧 µs」 */
const perFrame = (row, k) => ((row.seg[k] ?? 0) / row.frames) * 1000;
const totalPerFrame = (row) => (row.totalMs / row.frames) * 1000;

const allSegKeys = [...new Set(rows.flatMap((r) => Object.keys(r.seg)))];
const summary = [];
const totalMed = med(rows.map(totalPerFrame));

for (const k of allSegKeys) {
  // 顶层 13 段按固定顺序；机关类级（mech:）追加在后面
  if (!SEGMENTS.includes(k) && !k.startsWith("mech:")) continue;
  const vals = rows.map((r) => perFrame(r, k));
  summary.push({
    key: k,
    perFrameMed: +med(vals).toFixed(2),
    min: +Math.min(...vals).toFixed(2),
    max: +Math.max(...vals).toFixed(2),
    pct: totalMed ? +((med(vals) / totalMed) * 100).toFixed(1) : 0,
  });
}
// 段和只算顶层 13 段（机关类级是 updateMechs 的再分解，不能重复计入）
const segSum = summary.filter((s) => SEGMENTS.includes(s.key)).reduce((a, s) => a + s.perFrameMed, 0);
summary.push({
  key: "__unaccounted",
  perFrameMed: +(totalMed - segSum).toFixed(2),
  min: 0, max: 0,
  pct: totalMed ? +(((totalMed - segSum) / totalMed) * 100).toFixed(1) : 0,
});

console.log(`\nGameScene.update 逐帧分段（${LEVEL}，${rows.length} 轮 × ${FRAMES} 帧，仅 started 相位）`);
console.log(`  update 全程：${totalMed.toFixed(1)} µs/帧（中位）`);
console.log("  分段                 每帧(µs)   区间(µs)      占比");
for (const s of summary) {
  const label = s.key === "__unaccounted" ? s.key : `  ${s.key}`;
  console.log(`  ${label.padEnd(20)} ${String(s.perFrameMed).padStart(8)}   [${s.min}–${s.max}]`.padEnd(30) + ` ${String(s.pct).padStart(5)}%`);
}

// r51：机关类级分解（updateMechs 内部）
const mechRows = summary.filter((s) => s.key.startsWith("mech:"));
if (mechRows.length) {
  const mechTotal = summary.find((s) => s.key === "updateMechs")?.perFrameMed ?? 0;
  const mechSum = mechRows.reduce((a, s) => a + s.perFrameMed, 0);
  console.log(`\n  ── updateMechs 内部按机关类拆细（该段 ${mechTotal.toFixed(1)} µs/帧）──`);
  console.log("  机关类                  每帧(µs)   占 updateMechs   占 update");
  for (const s of [...mechRows].sort((a, b) => b.perFrameMed - a.perFrameMed)) {
    const name = s.key.slice(5);
    const ofMech = mechTotal ? ((s.perFrameMed / mechTotal) * 100).toFixed(1) : "0";
    console.log(`  ${name.padEnd(20)} ${String(s.perFrameMed).padStart(8)}   ${String(ofMech).padStart(12)}%   ${String(s.pct).padStart(5)}%`);
  }
  const mechUnaccounted = mechTotal - mechSum;
  console.log(`  ${"（未计入）".padEnd(20)} ${String(mechUnaccounted.toFixed(2)).padStart(8)}   ${String((mechTotal ? (mechUnaccounted / mechTotal) * 100 : 0).toFixed(1)).padStart(12)}%`);
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `update-${argSave}.json`);
  writeFileSync(out, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, frames: FRAMES, rounds: rows.length,
    totalPerFrameMed: +totalMed.toFixed(2), summary, rows,
  }, null, 1));
  log("快照已存", out);
}
if (argCompare) {
  const f = join(RESULTS, `update-${argCompare}.json`);
  if (!existsSync(f)) console.error("[update] 对比基线不存在:", f);
  else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    console.log(`\n对比 ${argCompare}（每帧 µs）：`);
    for (const s of summary) {
      const prev = base.summary.find((x) => x.key === s.key);
      if (!prev) continue;
      const d = prev.perFrameMed ? ((s.perFrameMed - prev.perFrameMed) / prev.perFrameMed) * 100 : 0;
      console.log(`  ${s.key.padEnd(20)} ${String(prev.perFrameMed).padStart(8)} → ${String(s.perFrameMed).padStart(8)}  ${(d >= 0 ? "+" : "") + d.toFixed(1)}%`);
    }
  }
}

/**
 * `st.platforms` 双趟遍历的可回收量（r51 新增）。
 *
 * ## 为什么需要
 * r50 的 `perf-update` 打出 `updateMechs` 57.7% + `updatePlatformSound` 18.9%，
 * 而后者**纯粹是第二趟 `st.platforms` 遍历**——只为把位姿喂给 `PlatformSoundTracker`。
 * r50 报告把它列为「未做」，理由是「会让 `stepPlatforms` 承担声音副作用、且改变调用顺序」。
 *
 * 要判断该不该做，先得知道**这一趟到底值多少钱**。r51 的按机关类拆细把
 * `cbPlatSnd` 量成 41.5µs/帧（占 update 15.3%），但那是**包了钩子**的口径，且
 * `performance.now()` 在本环境量化到 0.1ms（见下），逐回调计时的方差很大。
 *
 * ## 口径
 * 本件在**真实开局页面**上做**同页配对**分解，不用逐回调打点：
 *
 *   1. `noop`       —— `st.platforms.forEach(noop)`：纯遍历底价
 *   2. `read3`      —— 遍历 + 读 `x/y/angle` 三个 Colyseus 属性（不含 tracker）
 *   3. `sndStub`    —— 把 `scene.platformSounds` 换成 `{update(){}}`，跑**真实的**
 *                      `scene.updatePlatformSound`：遍历+读+Number+调用，tracker 归零
 *   4. `sndReal`    —— 恢复真 tracker，再跑一次：3 减 2 的差就是 tracker 自身
 *
 * 每一趟测 1 个 `performance.now()` 对（不是每次回调一对），所以量化误差被
 * 摊到整趟上；每趟迭代数按「让单趟 ≥8ms」自适应，相对误差 <1%。
 *
 * ## 已知限制（必须写进报告）
 * 探针在**静止快照**上重复跑，真 tracker 会收敛到「未移动」分支，所以
 * `sndReal − sndStub` 是 tracker 的**下界**（生产里含 play/stop 与差值算术）。
 * 本件要判的是「可回收的遍历成本」= `sndStub`，不受该限制影响。
 *
 * 用法：
 *   node --import tsx benchmark/perf-plat-pass.mjs
 *   LEVEL=forest_bonus_2 ITERS=400 node --import tsx benchmark/perf-plat-pass.mjs --save r51-platpass
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3673);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const ITERS = Number(process.env.ITERS ?? 400);
const ROUNDS = Number(process.env.ROUNDS ?? 7);
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

/**
 * 页内探针。
 *
 * 顺序很重要：先量 noop/read3（不碰 scene 状态），再换 stub 量 sndStub，
 * 最后**恢复原 tracker**再量 sndReal——保证探针结束后页面状态与探针前一致
 * （`platformSounds` 的 Map 里只在 sndReal 阶段被写过，且位姿与真实帧一致）。
 */
const PROBE = `async ({ iters, rounds }) => {
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const st = scene.d?.net?.room?.state;
  if (!st) return { error: "state 不可用" };
  if (!st.platforms) return { error: "本关无 platforms" };
  const now = () => performance.now();

  // 让单趟 ≥20ms（100µs 量化 → 单轮相对误差 <0.5%）。
  // 单趟只 ~0.5µs，需要上万趟才够，上限放到 1<<20。
  const TARGET_MS = 20;
  const calib = () => {
    let n = 1, t0, el = 0;
    while (n < (1 << 20)) {
      t0 = now();
      for (let i = 0; i < n; i++) st.platforms.forEach(() => {});
      el = now() - t0;
      if (el >= TARGET_MS) break;
      n *= 2;
    }
    return n;
  };

  /** 返回 µs/趟（performance.now() 是 ms，这里统一换算） */
  const bench = (fn, n) => {
    const out = [];
    // 预热 2 趟（JIT + 内联缓存）
    for (let i = 0; i < 2; i++) fn(n);
    for (let r = 0; r < rounds; r++) {
      const t0 = now();
      fn(n);
      out.push(((now() - t0) / n) * 1000);
    }
    out.sort((a, b) => a - b);
    return { med: out[Math.floor(out.length / 2)], min: out[0], max: out[out.length - 1] };
  };

  const n = calib();
  let platCount = 0;
  st.platforms.forEach(() => { platCount++; });
  const res = { itersPerRound: n, platforms: platCount, props: (() => { let c = 0; st.props?.forEach?.(() => { c++; }); return c; })() };

  // 1) 纯遍历底价
  res.noop = bench((k) => { for (let i = 0; i < k; i++) st.platforms.forEach(() => {}); }, n);

  // 2) 遍历 + 读三属性（Colyseus 属性是原型 getter → 每次都是访问器调用）
  let acc = 0;
  res.read3 = bench((k) => {
    for (let i = 0; i < k; i++) {
      st.platforms.forEach((b) => { acc += Number(b.x) + Number(b.y) + Number(b.angle); });
    }
  }, n);

  // 3) 真实 updatePlatformSound，但 tracker 换 no-op stub
  const realTracker = scene.platformSounds;
  scene.platformSounds = { update() {} };
  res.sndStub = bench((k) => { for (let i = 0; i < k; i++) scene.updatePlatformSound(st); }, n);
  scene.platformSounds = realTracker;

  // 4) 恢复真 tracker
  res.sndReal = bench((k) => { for (let i = 0; i < k; i++) scene.updatePlatformSound(st); }, n);

  // 5) updateMechs 骨架：stub 掉全部机关回调（只留 16 趟 forEach 的底价）
  const cbNames = ["cbLevers","cbPushers","cbPlatforms","cbProps","cbWinds","cbHangings","cbPulleys","cbRomans","cbBeamers","cbRotMirrors","cbBoxMirrors","cbInfiniteMirrors","cbLightPushers","cbSliders","cbTimedPushers"];
  const saved = {};
  for (const k of cbNames) { saved[k] = scene[k]; scene[k] = () => {}; }
  res.mechSkeleton = bench((kk) => { for (let i = 0; i < kk; i++) scene.updateMechs(st, now(), 16.67); }, Math.max(64, Math.floor(n / 4)));
  for (const k of cbNames) scene[k] = saved[k];

  res.acc = acc; // 防优化消除，同时给一个量级校验
  res.quantum = (() => {
    let prev = now(), step = Infinity;
    for (let i = 0; i < 5000; i++) { const t = now(); const d = t - prev; if (d > 0 && d < step) step = d; prev = t; }
    return step * 1000; // µs
  })();
  return res;
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
    res = await page.evaluate(`(${PROBE})(${JSON.stringify({ iters: ITERS, rounds: ROUNDS })})`);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!res || res.error) { console.error("[platpass] 失败:", res?.error ?? "无结果"); process.exit(1); }

const us = (x) => x.toFixed(2);
console.log(`\nst.platforms 双趟遍历分解（${LEVEL}，${res.platforms} 平台 / ${res.props} 道具，${ROUNDS} 轮 × ${res.itersPerRound} 趟）`);
console.log(`  performance.now 量化粒度：${res.quantum.toFixed(0)} µs\n`);
console.log("  探针                          µs/趟   区间(µs)");
const rows = [
  ["noop（纯遍历底价）", res.noop],
  ["read3（遍历+读 x/y/angle）", res.read3],
  ["sndStub（真 updatePlatformSound，tracker 换空桩）", res.sndStub],
  ["sndReal（真 tracker）", res.sndReal],
  ["mechSkeleton（16 趟 forEach，回调全空桩）", res.mechSkeleton],
];
for (const [label, m] of rows) {
  console.log(`  ${label.padEnd(46)} ${us(m.med).padStart(7)}   [${us(m.min)}–${us(m.max)}]`);
}
const trackerPart = res.sndReal.med - res.sndStub.med;
console.log(`\n  → tracker 自身（sndReal − sndStub）：${us(trackerPart)} µs/帧（静止快照，下界）`);
console.log(`  → 合并可回收（遍历 + 3 属性读 + Number + 调用）：${us(res.sndStub.med)} µs/帧`);
console.log(`     其中纯遍历 ${us(res.noop.med)} + 读三属性 ${us(res.read3.med - res.noop.med)}`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `platpass-${argSave}.json`);
  writeFileSync(out, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, rounds: ROUNDS,
    itersPerRound: res.itersPerRound, platforms: res.platforms, props: res.props,
    quantumUs: res.quantum, probes: res,
    derived: { trackerUs: trackerPart, mergeableUs: res.sndStub.med },
  }, null, 1));
  console.log(`\n[platpass] 快照已存 ${out}`);
}

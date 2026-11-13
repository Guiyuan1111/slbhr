/**
 * 平台电机声的音效实例生命周期计数（r52 新增）。
 *
 * ## 为什么需要
 * r51 顺带量到：`startPlatformSound` 每次起步都 `sound.add("sfx_platform")`
 * 新建 Phaser 音效实例，`stopPlatformSound` 每次 `stop + destroy` 销毁。
 * 单次 add+play+stop+destroy ≈ 0.15ms（页内实测：add 0.067ms + play 0.025ms）。
 * `forest_bonus_2` 128 帧里 18 play + 18 stop（峰值同时 4 实例）。
 *
 * 这是**确定性**可数的对象生命周期事件，与 r50 的对象实例计数同一纪律：
 * 池化后 `sound.add` 调用数应归零（首轮预热除外）。
 *
 * ## 口径
 * 包 `scene.sound.add` / `BaseSound.destroy`，统计 N 个真实 started 帧内的：
 *   - `sound.add("sfx_platform")` 次数（新建）
 *   - 平台声实例 destroy 次数
 *   - play/stop 次数（事件数，用作分母）
 *   - 同时存活实例峰值
 *
 * 用法：
 *   node --import tsx benchmark/perf-sound-churn.mjs
 *   LEVEL=forest_bonus_2 FRAMES=300 node --import tsx benchmark/perf-sound-churn.mjs --save r52-churn
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3679);
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
  if (!scene || !scene.sound) return { error: "scene/sound 不可用" };

  const stats = { frames: 0, add: 0, addPlat: 0, destroy: 0, play: 0, stop: 0, maxAlive: 0 };
  let alive = 0;
  const realAdd = scene.sound.add.bind(scene.sound);
  scene.sound.add = function (key, config) {
    stats.add++;
    if (key === "sfx_platform") { stats.addPlat++; alive++; stats.maxAlive = Math.max(stats.maxAlive, alive); }
    return realAdd(key, config);
  };
  const BaseSound = Phaser.Sound.BaseSound.prototype;
  const realDestroy = BaseSound.destroy;
  BaseSound.destroy = function () {
    if (this.key === "sfx_platform") { stats.destroy++; alive--; }
    return realDestroy.call(this);
  };
  const realPlay = BaseSound.play;
  BaseSound.play = function () { if (this.key === "sfx_platform") stats.play++; return realPlay.apply(this, arguments); };
  const realStop = BaseSound.stop;
  BaseSound.stop = function () { if (this.key === "sfx_platform") stats.stop++; return realStop.call(this); };

  const origUpdate = scene.update;
  const wrapped = function (t, d) {
    const st = this.d?.net?.room?.state;
    if (st && String(st.phase ?? "") === "started" && String(st.levelId ?? "") === this.d.level.id) {
      stats.frames++;
      if (stats.frames >= frames) stats.__done = true;
    }
    return origUpdate.call(this, t, d);
  };
  scene.update = wrapped;
  if (scene.sys) scene.sys.sceneUpdate = wrapped;

  const dl = performance.now() + 120000;
  while (performance.now() < dl && !stats.__done) await new Promise((r) => setTimeout(r, 20));

  scene.sound.add = realAdd;
  BaseSound.destroy = realDestroy;
  BaseSound.play = realPlay;
  BaseSound.stop = realStop;
  if (scene.sys) scene.sys.sceneUpdate = origUpdate;

  if (!stats.frames) return { error: "未采到帧" };
  return stats;
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

if (!res || res.error) { console.error("[churn] 失败:", res?.error ?? "无结果"); process.exit(1); }

const pf = (v) => (v / res.frames).toFixed(3);
console.log(`\n平台电机声实例生命周期（${LEVEL}，${res.frames} 个真实 started 帧）\n`);
console.log(`  sound.add 总数            ${String(res.add).padStart(7)}   ${pf(res.add)}/帧`);
console.log(`  其中 sfx_platform 新建    ${String(res.addPlat).padStart(7)}   ${pf(res.addPlat)}/帧`);
console.log(`  sfx_platform destroy      ${String(res.destroy).padStart(7)}   ${pf(res.destroy)}/帧`);
console.log(`  sfx_platform play/stop    ${String(res.play).padStart(7)} / ${res.stop}`);
console.log(`  同时存活峰值              ${String(res.maxAlive).padStart(7)}`);
console.log(`\n  → 池化可消除的新建/销毁：${res.addPlat} 次 add + ${res.destroy} 次 destroy（${res.frames} 帧内）`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `churn-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, frames: res.frames, ...res,
  }, null, 1));
  console.log(`\n[churn] 快照已存 ${f}`);
}

/**
 * 内存常驻画像：真实会话长浸泡的堆斜率 + 缓存确定性计数（r56 新增）。
 *
 * ## 为什么存在
 * 战役 55 轮全是 CPU/网络口径，**内存常驻从未作为主轴量过**（r47 量的是每步
 * 分配速率，审计域的 H4 只裁「有界性」对错不量数字）。本件回答：一场真实会话
 * 从进入关卡起的 JS 堆是否稳定？纹理/音频缓存是否恒定？——平坦 → 判不立项
 * 留档；单调增长 → 就是下一个优化点的实锤。
 *
 * ## 口径
 * Chromium `--enable-precise-memory-info`（perf-client r3 同款）下逐秒采样：
 *   - `usedJSHeapSize`：进入关卡后 30s 预热期不计入斜率（加载/解码尾波），
 *     其后 ~150s 做线性回归 → **KB/分钟常驻斜率**
 *   - 纹理：键数 + 全部源像素面积和（确定性计数，非字节估算）
 *   - 音频：cache.audio 键数；平台声实例数（r52 池，上界=峰值并发）
 *   - 房间实体数（platforms/props：started 期恒定，漂移=异常）
 * 周期性活动：每 10s 按住移动键 1s，防「全静 ASCII 死房」假设失真。
 *
 * 用法：
 *   LEVEL=forest_bonus_2 SECS=150 node --import tsx benchmark/perf-mem-residency.mjs --save r56-mem
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
const SECS = Number(process.env.SECS ?? 150);
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

const PROBE = `async (secs) => {
  const game = window.__fw; // main.ts: __fw 即 Phaser.Game 实例
  const scene = game?.scene?.getScene("Game");
  if (!game || !scene) return { error: "game/scene 不可用" };
  if (!performance.memory) return { error: "performance.memory 不可用（需 --enable-precise-memory-info）" };
  const room = scene.d?.net?.room;
  const countKeys = (m) => { let n = 0; m.forEach ? m.forEach(() => n++) : (n = m.size ?? 0); return n; };
  const texPixels = () => {
    let px = 0;
    for (const k of game.textures.getTextureKeys()) {
      const src = game.textures.get(k).source && game.textures.get(k).source[0];
      if (src) px += src.width * src.height;
    }
    return px;
  };
  const snap = (t) => ({
    t,
    heap: performance.memory.usedJSHeapSize,
    texKeys: game.textures.getTextureKeys().length,
    texPixels: texPixels(),
    audioKeys: game.cache?.audio?.getKeys ? game.cache.audio.getKeys().length : -1, // BaseCache.getKeys()
    plat: countKeys(room?.state?.platforms ?? {}),
    props: countKeys(room?.state?.props ?? {}),
  });
  const samples = [snap(0)];
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < secs) {
    await new Promise((r) => setTimeout(r, 1000));
    samples.push(snap((Date.now() - t0) / 1000));
  }
  return { samples };
}`;

const server = await startServer();
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-precise-memory-info"],
});
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

    // 周期活动：每 10s 按住 1s（异步并行于采样探针）
    const mover = (async () => {
      while (true) {
        await page.waitForTimeout(9000);
        await page.keyboard.down("ArrowRight");
        await pageB.keyboard.down("KeyD");
        await page.waitForTimeout(1000);
        await page.keyboard.up("ArrowRight");
        await pageB.keyboard.up("KeyD");
      }
    })();
    mover.catch(() => {});

    const r = await page.evaluate(`(${PROBE})(${SECS})`);
    if (r.error) throw new Error(r.error);
    res = r;
    await mover.cancel?.();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

const S = res.samples;
const WARM = 30; // 预热秒：加载/解码尾波不计斜率
const win = S.filter((s) => s.t >= WARM);
const n = win.length;
if (n < 20) { console.error("[mem] 窗口过短"); process.exit(1); }
const mx = win.reduce((a, s) => a + s.t, 0) / n;
const my = win.reduce((a, s) => a + s.heap, 0) / n;
const sxy = win.reduce((a, s) => a + (s.t - mx) * (s.heap - my), 0);
const sxx = win.reduce((a, s) => a + (s.t - mx) ** 2, 0);
const slopeBps = sxy / sxx; // B/s
const slopeKBmin = (slopeBps * 60) / 1024;
const hmin = Math.min(...win.map((s) => s.heap)) / 1048576;
const hmax = Math.max(...win.map((s) => s.heap)) / 1048576;
const h0 = S[0].heap / 1048576;
const texDeltas = [...new Set(win.map((s) => s.texKeys))].length;
const texPx = [...new Set(win.map((s) => s.texPixels))];
const audDeltas = [...new Set(win.map((s) => s.audioKeys))].length;
const platSet = [...new Set(win.map((s) => s.plat))];
const propSet = [...new Set(win.map((s) => s.props))];

console.log(`\n内存常驻画像（${LEVEL}，${SECS}s 浸泡，预热 ${WARM}s，${n} 采样）\n`);
console.log(`  JS 堆  进入时 ${h0.toFixed(1)} MB ｜ 窗口带 ${hmin.toFixed(1)}–${hmax.toFixed(1)} MB`);
console.log(`  常驻斜率  ${slopeKBmin >= 0 ? "+" : ""}${slopeKBmin.toFixed(1)} KB/分钟  ${Math.abs(slopeKBmin) < 50 ? "→ 平坦（带内）" : "→ 有趋势，值得追"}`);
console.log(`  纹理键数  ${texDeltas === 1 ? "恒定 " + win[0].texKeys : "漂移! " + [...new Set(win.map((s) => s.texKeys))].join(",")}`);
console.log(`  纹理像素  ${texPx.length === 1 ? "恒定 " + (texPx[0] / 1e6).toFixed(1) + " MP" : "漂移! " + texPx.join(",")}`);
console.log(`  音频键数  ${audDeltas === 1 ? "恒定 " + win[0].audioKeys : "漂移! " + [...new Set(win.map((s) => s.audioKeys))].join(",")}`);
console.log(`  房间实体  platforms=${platSet.join(",")} props=${propSet.join(",")}${platSet.length === 1 && propSet.length === 1 ? "（恒定）" : "（漂移!）"}`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `mem-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, secs: SECS, warm: WARM,
    heap0MB: +h0.toFixed(2), bandMB: [+hmin.toFixed(2), +hmax.toFixed(2)],
    slopeKBPerMin: +slopeKBmin.toFixed(2), texKeys: win[0].texKeys, texPixels: texPx[0],
    audioKeys: win[0].audioKeys, platforms: platSet[0], props: propSet[0],
    samples: S.map((s) => [+s.t.toFixed(0), +((s.heap / 1048576).toFixed(2))]),
  }, null, 1));
  console.log(`\n[mem] 快照已存 ${f}`);
}

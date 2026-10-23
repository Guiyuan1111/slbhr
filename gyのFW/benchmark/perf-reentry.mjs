/**
 * 离房→重进复原量具（r41 立）。
 *
 * 面：r41 把房内独占资源（房内字体 8.56MiB 解码、结算变体 ~1.97MiB、关卡 BGM ~14.99MiB PCM）
 * 在「离房回选关」时交还，换大厅驻留 −25.5MB。收益的代价必须逐项测出来：
 *   - 交还是否真的发生（大厅里 font-full/font-room、popup-finish-*、五支关卡 BGM 的缓存/纹理是否存在）；
 *   - 重进时它们各自在什么时刻回来（页内 8ms 轮询记首次出现时刻，相对 **#btn-create 点击**）；
 *   - r42 起同量 chars-play 精灵表（10.75MiB 解码）与 11 个全局动画键：离房先摘键再移除纹理，
 *     重进纹理到达后 buildCharAnims 重新注册（playMs / charAnimsMs）；
 *   - 是否挡住可玩：字体在 GameScene.preload（进房闸内），结算变体与 BGM 在 create 之后异步补，
 *     故分别对 gameActive / bgmPlaying 计时，把「进房多花的毫秒」与「出声延后」分开。
 *
 * 为什么不用两个玩家：本量具只量页面侧装载/解码时刻。Game 场景在房间创建后即起步（lobby 相位），
 * 字体在 preload、BGM/结算在 create 的 kick* 里，均不依赖 phase=started；双人只影响开局钟。
 * 单玩家还能避免第二页在 slow3g 上与主页面抢带宽，把「解码代价」污染成「带宽代价」。
 *
 * 口径：
 *   - 首进走真实菜单（enterAs create）→ Game active；随后每轮 `__fwLeaveToMenu()`（EndMenu「继续」
 *     同一入口）→ 等 Temple 树烘焙落定 → 拍大厅驻留/存量 → `onLevelPicked(level)` 弹回面板
 *     → 点 #btn-create → 拍重进时刻与复原结果。
 *   - 时刻一律取页内 performance.now()，#btn-create 的 capture 监听先于产品 handler 记 t0；
 *     resource timing 的 startTime 与 performance.now() 同一时钟，新条目按 startTime ≥ t0 过滤。
 *   - 资源口径同 perf-load/perf-resident：传输/解码字节取自 Resource Timing，纹理与 PCM 按
 *     w·h·4 / 帧数·声道·4 逐源求和（解码后的真实驻留）。
 *   - --net 档位与 perf-load 完全同式（含静默失效断言）：重进的 PNG/音频走 HTTP 缓存，
 *     弱网档主要卡房间创建与 fnt 复验；档位若没生效，读数一律不可用作弱网主张。
 *
 * 用法：
 *   node --import tsx benchmark/perf-reentry.mjs [--no-build] [--level forest_01]
 *        [--net off|4g|fast3g|slow3g] [--cycles 2] [--port 3569] --save <label>
 * 产物：benchmark/results/reentry-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, startServer } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const argOf = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const LABEL = argOf("--save") ?? "run";
const LEVEL = argOf("--level") ?? "forest_01";
const CYCLES = Math.max(1, Number(argOf("--cycles") ?? 2));
const NO_BUILD = process.argv.includes("--no-build");
const PORT = Number(argOf("--port") ?? process.env.FW_R41_PORT ?? 3569);
const log = (...a) => console.log("[reentry]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 与 perf-load 同步的档位表（改档位时两处一起改，否则跨量具读数不可比） */
const NET_PROFILES = {
  off: { latency: 0, down: -1, up: -1, waitScale: 1, desc: "不节流（历轮口径）" },
  cable: { latency: 30, down: 1_250_000, up: 312_500, waitScale: 8, desc: "有线 10Mbps↓/2.5Mbps↑ · 30ms" },
  "4g": { latency: 80, down: 500_000, up: 125_000, waitScale: 24, desc: "4G 4Mbps↓/1Mbps↑ · 80ms" },
  fast3g: { latency: 150, down: 200_000, up: 93_750, waitScale: 60, desc: "Lighthouse Fast 3G 1.6Mbps↓/0.75Mbps↑ · 150ms" },
  slow3g: { latency: 400, down: 62_500, up: 62_500, waitScale: 200, desc: "Lighthouse Slow 3G 0.5Mbps↓↑ · 400ms" },
};
const NET_NAME = argOf("--net") ?? "off";
if (!Object.hasOwn(NET_PROFILES, NET_NAME)) {
  throw new Error(`--net 档位未知：${NET_NAME}（可用：${Object.keys(NET_PROFILES).join("/")}）`);
}
const NET = { ...NET_PROFILES[NET_NAME] };
if (argOf("--rtt") !== undefined) NET.latency = Number(argOf("--rtt"));
if (argOf("--down") !== undefined) NET.down = Math.round((Number(argOf("--down")) * 1_000_000) / 8);
if (argOf("--up") !== undefined) NET.up = Math.round((Number(argOf("--up")) * 1_000_000) / 8);
const THROTTLED = NET_NAME !== "off" || NET.latency > 0 || NET.down !== NET_PROFILES[NET_NAME].down;
const W = (ms) => Math.round(ms * NET.waitScale);

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

/** 页内：纹理/PCM 逐源求和 + 场景对象数（口径逐字同 perf-resident，便于跨轮对账） */
function collectPage() {
  const g = globalThis.__fw;
  if (!g) return { ok: false };
  const px = (w, h) => w * h * 4;
  let texMB = 0, canvasTexMB = 0;
  const texTop = [];
  for (const key of Object.keys(g.textures.list)) {
    const t = g.textures.list[key];
    let b = 0, isCanvas = 0;
    for (const s of Object.values(t.source || {})) {
      const img = s && s.image;
      if (!img || !img.width) continue;
      if (typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement) isCanvas += px(img.width, img.height);
      b += px(img.width, img.height);
    }
    texMB += b;
    canvasTexMB += isCanvas;
    if (b > 200000) texTop.push([key, +(b / 1048576).toFixed(2)]);
  }
  let audioMB = 0;
  const audioTop = [];
  try {
    const ent = typeof g.cache.audio.getKeys === "function" ? g.cache.audio.getKeys() : [];
    for (const k of ent) {
      const buf = g.cache.audio.get(k);
      if (!buf) continue;
      const b = buf.length
        ? buf.length * (buf.numberOfChannels || 1) * 4
        : (buf.data || []).reduce((s, ch) => s + (ch.length || 0) * (ch.BYTES_PER_ELEMENT || 4), 0);
      audioMB += b;
      if (b > 200000) audioTop.push([k, +(b / 1048576).toFixed(2)]);
    }
  } catch (e) { audioTop.push(["ERR", String(e)]); }
  const sceneObjs = {};
  for (const s of g.scene.scenes) if (s.scene.isActive() && s.children) sceneObjs[s.scene.key] = s.children.length;
  const gc = globalThis.__fwGroundStats ? globalThis.__fwGroundStats() : null;
  const tb = globalThis.__fwTreeStats ? globalThis.__fwTreeStats() : null;
  return {
    ok: true,
    texMB: +(texMB / 1048576).toFixed(2),
    canvasTexMB: +(canvasTexMB / 1048576).toFixed(2),
    texTop: texTop.sort((a, b) => b[1] - a[1]).slice(0, 8),
    audioMB: +(audioMB / 1048576).toFixed(2),
    audioTop: audioTop.sort((a, b) => b[1] - a[1]).slice(0, 8),
    audioCount: typeof g.cache.audio.getKeys === "function" ? g.cache.audio.getKeys().length : 0,
    audioKeys: typeof g.cache.audio.getKeys === "function" ? g.cache.audio.getKeys().slice().sort() : [],
    ground: gc,
    tree: tb,
    sceneObjs,
    heapRawMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
  };
}

/** 页内：四类资源的存量与播放态（键名与 BootScene/audio.ts 的公开常量一致，键表取 cfg） */
function presenceSnapshot(cfg) {
  const g = globalThis.__fw;
  const tex = (k) => g.textures.exists(k);
  const aud = (k) => g.cache.audio.exists(k);
  const playing = (k) => g.sound.isPlaying(k);
  const fontKeys = ["font-full", "font-room"];
  const finishKeys = ["popup-finish-general", "popup-finish-speed", "popup-finish-puzzle"];
  const bgmKeys = ["bgm_level", "bgm_level_speed", "bgm_finish", "bgm_finish_speed", "bgm_over"];
  return {
    font: Object.fromEntries(fontKeys.map((k) => [k, tex(k)])),
    finish: Object.fromEntries(finishKeys.map((k) => [k, tex(k)])),
    bgmCached: Object.fromEntries(bgmKeys.map((k) => [k, aud(k)])),
    bgmPlaying: Object.fromEntries(bgmKeys.map((k) => [k, playing(k)])),
    play: tex(cfg.playKey),
    charAnims: Object.fromEntries(cfg.charAnimKeys.map((k) => [k, g.anims.exists(k)])),
    menuBgm: { cached: aud("bgm_menu"), playing: playing("bgm_menu") },
    audioKeys: typeof g.cache.audio.getKeys === "function" ? g.cache.audio.getKeys().slice().sort() : [],
  };
}

/** 页内：重进时刻表。t0 取 #btn-create 的 capture 监听（先于产品 handler），8ms 轮询记首次出现。 */
function installReentryWatch(cfg) {
  const g = globalThis.__fw;
  const W = {
    t0: null,
    font: null,
    finish: null,
    gameActive: null,
    bgmCached: null,
    bgmPlaying: null,
    menuBgmStopped: null,
    charsPlay: null,
    charAnims: null,
    audio: {},
    play: {},
    timer: null,
  };
  globalThis.__reWatch = W;
  // 安装早于 #btn-create 点击：此刻已在（A 臂未交还或快速路径）记 0，表示点击时即就绪
  W.charsPlay = g.textures.exists(cfg.playKey) ? 0 : null;
  W.charAnims = cfg.charAnimKeys.every((k) => g.anims.exists(k)) ? 0 : null;
  document.querySelector("#btn-create").addEventListener(
    "click",
    () => {
      W.t0 = performance.now();
    },
    { capture: true, once: true },
  );
  const rel = () => +(performance.now() - W.t0).toFixed(1);
  const tick = () => {
    if (W.t0 == null) return;
    if (W.font == null && cfg.fontKeys.some((k) => g.textures.exists(k))) W.font = rel();
    if (W.finish == null && cfg.finishKeys.some((k) => g.textures.exists(k))) W.finish = rel();
    if (W.gameActive == null && g.scene.isActive("Game")) W.gameActive = rel();
    if (W.bgmCached == null && cfg.bgmKeys.some((k) => g.cache.audio.exists(k))) W.bgmCached = rel();
    if (W.bgmPlaying == null && cfg.bgmKeys.some((k) => g.sound.isPlaying(k))) W.bgmPlaying = rel();
    if (W.menuBgmStopped == null && !g.sound.isPlaying("bgm_menu")) W.menuBgmStopped = rel();
    if (W.charsPlay == null && g.textures.exists(cfg.playKey)) W.charsPlay = rel();
    if (W.charAnims == null && cfg.charAnimKeys.every((k) => g.anims.exists(k))) W.charAnims = rel();
    for (const k of cfg.bgmKeys) {
      if (W.audio[k] == null && g.cache.audio.exists(k)) W.audio[k] = rel();
      if (W.play[k] == null && g.sound.isPlaying(k)) W.play[k] = rel();
    }
  };
  W.timer = setInterval(tick, 8);
}

function readReentryWatch() {
  const W = globalThis.__reWatch;
  if (W?.timer) clearInterval(W.timer);
  if (W) W.timer = null;
  return W ? JSON.parse(JSON.stringify({ ...W, timer: undefined })) : null;
}

/** 页内：t0 之后开始的资源条目（fetch/XHR 均会留条目；HTTP 命中时 transferSize=0） */
function newResourceEntries(t0) {
  return performance
    .getEntriesByType("resource")
    .filter((e) => e.startTime >= t0 - 0.5)
    .map((e) => ({
      url: e.name.replace(/^https?:\/\/[^/]+/, ""),
      type: e.initiatorType || "other",
      transferKB: +((e.transferSize || 0) / 1024).toFixed(1),
      decodedKB: +((e.decodedBodySize || 0) / 1024).toFixed(1),
      startMs: +(e.startTime - t0).toFixed(1),
      endMs: +(e.responseEnd - t0).toFixed(1),
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

/** 首进资源清单（总量/最大单笔/逐条），供节流自证与冷启动字节参考 */
function resourceSnapshot() {
  const es = performance.getEntriesByType("resource");
  const byType = {};
  let totalTransfer = 0, totalDecoded = 0;
  let largest = null;
  const items = [];
  for (const e of es) {
    const t = e.initiatorType || "other";
    byType[t] = byType[t] || { n: 0, transferKB: 0, decodedKB: 0 };
    byType[t].n++;
    byType[t].transferKB += (e.transferSize || 0) / 1024;
    byType[t].decodedKB += (e.decodedBodySize || 0) / 1024;
    totalTransfer += e.transferSize || 0;
    totalDecoded += e.decodedBodySize || 0;
    items.push({
      url: e.name.replace(/^https?:\/\/[^/]+/, ""),
      type: t,
      transferKB: +((e.transferSize || 0) / 1024).toFixed(1),
      decodedKB: +((e.decodedBodySize || 0) / 1024).toFixed(1),
      startMs: +e.startTime.toFixed(0),
      endMs: +e.responseEnd.toFixed(0),
    });
    if ((e.transferSize || 0) > 0 && (!largest || e.transferSize > largest.bytes)) {
      largest = { url: e.name.replace(/^https?:\/\/[^/]+/, ""), bytes: e.transferSize, bodyMs: +(e.responseEnd - e.responseStart).toFixed(1) };
    }
  }
  return {
    count: es.length,
    totalTransferKB: +(totalTransfer / 1024).toFixed(0),
    totalDecodedKB: +(totalDecoded / 1024).toFixed(0),
    byType,
    items,
    largest: largest ? { url: largest.url, KB: +(largest.bytes / 1024).toFixed(1), bodyMs: largest.bodyMs } : null,
  };
}

/** 延迟档的直接证据（同 perf-load r30）：1KB 静态文件、cache-bust、连测两次取小值 */
async function probeLatencyWall(page) {
  return page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      await fetch(`/assets/atlasses/CharAssetsEntry.json?latency_probe=${Date.now()}_${i}`, { cache: "no-store" });
      out.push(performance.now() - t0);
    }
    return +Math.min(...out).toFixed(1);
  });
}

function assertThrottleActive(wallMs, largest, tag) {
  if (!THROTTLED) return { profile: NET_NAME, checked: false };
  const fails = [];
  if (NET.latency > 0) {
    const floor = 0.5 * NET.latency;
    if (wallMs === null) fails.push("无页内墙钟延迟探针");
    else if (wallMs < floor) fails.push(`墙钟延迟探针 ${wallMs}ms < 0.5×rtt(${floor}ms)`);
  }
  if (NET.down > 0) {
    if (!largest) fails.push("无最大单笔可证带宽");
    else {
      const floor = 0.5 * ((largest.KB * 1024) / NET.down) * 1000;
      if (largest.bodyMs < floor) fails.push(`${largest.url} 响应体 ${largest.bodyMs}ms < 0.5×名义(${floor.toFixed(0)}ms)`);
    }
  }
  if (fails.length) {
    throw new Error(`节流档位 ${NET_NAME} 静默失效（${tag}）：${fails.join("；")}——该读数不可用作弱网主张`);
  }
  return { profile: NET_NAME, checked: true, latencyMs: NET.latency, downBps: NET.down, upBps: NET.up, latencyWallMs: wallMs, largestKB: largest?.KB ?? null, largestBodyMs: largest?.bodyMs ?? null };
}

async function waitSceneActive(page, key, timeout) {
  await page.waitForFunction((k) => globalThis.__fw?.scene?.isActive(k), key, { timeout, polling: 40 });
}

function treeIdlePage() {
  const t = globalThis.__fwTreeStats?.();
  return !!globalThis.__fw?.textures?.exists("tree-all") && (!t || t.jobs === 0);
}

const SERVER = await startServer(PORT, {});
const browser = await chromium.launch({
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
const errs = [];
const out = {
  meta: {
    tool: "perf-reentry",
    label: LABEL,
    level: LEVEL,
    net: NET_NAME,
    netDesc: NET.desc,
    cycles: CYCLES,
    port: PORT,
    generatedAt: new Date().toISOString(),
    commit: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(),
    dirty: execSync("git status --porcelain -- packages/client/src", { cwd: ROOT }).toString().trim() !== "",
  },
  cycles: [],
  errors: errs,
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  if (THROTTLED && !process.env.FW_NET_NOOP) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: NET.latency,
      downloadThroughput: NET.down,
      uploadThroughput: NET.up,
    });
  }

  // —— 首进：真实菜单 create → Game active（单玩家即可，见头注）
  log(`首进 ${LEVEL}（net=${NET_NAME}）…`);
  await enterAs(page, PORT, "create", "", LEVEL, NET.waitScale);
  await waitSceneActive(page, "Game", W(60000));
  const cfg = {
    fontKeys: ["font-full", "font-room"],
    finishKeys: ["popup-finish-general", "popup-finish-speed", "popup-finish-puzzle"],
    bgmKeys: ["bgm_level", "bgm_level_speed", "bgm_finish", "bgm_finish_speed", "bgm_over"],
    playKey: "chars-play", // 房内独占角色精灵表（10.75MiB 解码，442.4KB PNG）
    charAnimKeys: [
      // 离房时先摘、重进纹理到达后由 ensureCharAnims→buildCharAnims 重新注册的 11 个全局动画键
      "fire_legs_run", "fire_jump", "fire_fall", "fire_rising", "fire_stairs",
      "water_legs_run", "water_jump", "water_fall", "water_rising", "water_stairs", "smoke",
    ],
  };
  // 首进必须等"延迟装载"落定再拍基线：BGM 循环曲/终局曲、结算变体、chars-play 都在 create 之后取，
  // slow3g 下 LevelMusic 1.28MB 就要 ≈20s。不等就离房，量到的是"半装房间"，cycle 1 的
  // 存量/交还标记全被在飞请求搅乱（r41 首轮即踩到：初始 audio 缺 bgm_level、tex 缺 chars-play）。
  // r42 起还等 chars-play 落定后 11 个全局动画键全部注册，否则离房前的基线本身不完整。
  const settleTimeout = Math.max(30000, Math.min(W(90000), 180000));
  log(`等首进延迟装载落定（上限 ${Math.round(settleTimeout / 1000)}s）…`);
  await page.waitForFunction(
    (c) => {
      const g = globalThis.__fw;
      const font = c.fontKeys.some((k) => g.textures.exists(k));
      const finish = c.finishKeys.some((k) => g.textures.exists(k));
      const loop = g.cache.audio.exists("bgm_level") || g.cache.audio.exists("bgm_level_speed");
      const term = g.cache.audio.exists("bgm_over") && (g.cache.audio.exists("bgm_finish") || g.cache.audio.exists("bgm_finish_speed"));
      const play = g.textures.exists(c.playKey);
      const charAnims = c.charAnimKeys.every((k) => g.anims.exists(k));
      return font && finish && loop && term && play && charAnims;
    },
    cfg,
    { timeout: settleTimeout, polling: 200 },
  );
  await sleep(1200); // 相机收敛 + 最后一批 kick 的 complete 回调落定
  const firstLoad = await page.evaluate(resourceSnapshot);
  const wallMs = THROTTLED ? await probeLatencyWall(page) : null;
  out.throttle = assertThrottleActive(wallMs, firstLoad.largest, "首进");
  out.firstLoad = {
    count: firstLoad.count,
    totalTransferKB: firstLoad.totalTransferKB,
    totalDecodedKB: firstLoad.totalDecodedKB,
    byType: firstLoad.byType,
    largest: firstLoad.largest,
  };
  const initialPage = await page.evaluate(collectPage);
  const initialPresence = await page.evaluate(presenceSnapshot, cfg);
  out.initial = { page: initialPage, presence: initialPresence };
  const roomFonts = ["font-full", "font-room"].filter((k) => initialPresence.font[k]);
  const finishKeys = ["popup-finish-general", "popup-finish-speed", "popup-finish-puzzle"].filter((k) => initialPresence.finish[k]);
  const roomBgms = initialPresence.audioKeys.filter((k) => k.startsWith("bgm_") && k !== "bgm_menu");
  log(`首进落定：纹 ${initialPage.texMB}MB 音 ${initialPage.audioMB}MB/${initialPage.audioCount}键 | 房内字体 ${roomFonts.join("+") || "无"} 结算 ${finishKeys.join("+") || "无"} 房内BGM ${roomBgms.join("+") || "无"}`);

  for (let i = 1; i <= CYCLES; i++) {
    // —— 离房回大厅：与 EndMenu「继续」同一入口
    await page.evaluate(() => globalThis.__fwLeaveToMenu?.());
    await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 15000, polling: 40 });
    await page.waitForFunction(treeIdlePage, null, { timeout: 30000, polling: 60 }).catch(() => {});
    await sleep(900); // 黑幕 + 菜单曲起播落定

    const hallPage = await page.evaluate(collectPage);
    const hallPresence = await page.evaluate(presenceSnapshot, cfg);
    const hall = {
      page: hallPage,
      presence: hallPresence,
      delta: {
        texMB: +(hallPage.texMB - initialPage.texMB).toFixed(2),
        audioMB: +(hallPage.audioMB - initialPage.audioMB).toFixed(2),
      },
      released: {
        font: roomFonts.length > 0 && roomFonts.every((k) => !hallPresence.font[k]),
        finish: finishKeys.length > 0 && finishKeys.every((k) => !hallPresence.finish[k]),
        bgm: roomBgms.length > 0 && roomBgms.every((k) => !hallPresence.bgmCached[k]),
        play: !hallPresence.play, // 仅记录：A 臂不交还时 false，不算失败
      },
    };
    log(
      `第 ${i} 轮离房：纹 ${hallPage.texMB}MB（Δ${hall.delta.texMB}）音 ${hallPage.audioMB}MB/${hallPage.audioCount}键（Δ${hall.delta.audioMB}）` +
        ` | 交还 字体=${hall.released.font} 结算=${hall.released.finish} BGM=${hall.released.bgm} chars-play=${hallPresence.play ? "仍驻留" : "已交还"}` +
        ` | 菜单曲 ${hallPresence.menuBgm.playing ? "在播" : "未播"}`,
    );

    // —— 重进：onLevelPicked 弹回面板 → 点 #btn-create（capture 先记 t0）
    await page.evaluate((lv) => globalThis.__fw.registry.get("onLevelPicked")(lv), LEVEL);
    await page.waitForSelector("#menu", { state: "visible", timeout: 10000 });
    const preClick = await page.evaluate(presenceSnapshot, cfg);
    await page.evaluate(installReentryWatch, cfg);
    await page.click("#btn-create");
    await page.waitForFunction(() => globalThis.__reWatch?.t0 != null, null, { timeout: 10000, polling: 20 });
    await waitSceneActive(page, "Game", 60000);
    await page
      .waitForFunction(
        (c) => {
          const w = globalThis.__reWatch;
          return !!(w && w.font != null && w.finish != null && w.bgmPlaying != null && w.gameActive != null && w.charsPlay != null && w.charAnims != null);
        },
        cfg,
        { timeout: Math.min(W(20000), 60000), polling: 40 },
      )
      .catch(() => {});
    await sleep(700); // 复原后的装载队列落定

    const watch = await page.evaluate(readReentryWatch);
    const newResources = await page.evaluate(newResourceEntries, watch.t0);
    const postPage = await page.evaluate(collectPage);
    const postPresence = await page.evaluate(presenceSnapshot, cfg);
    const post = {
      page: postPage,
      presence: postPresence,
      restored: {
        font: roomFonts.every((k) => postPresence.font[k]),
        finish: finishKeys.every((k) => postPresence.finish[k]),
        bgm: roomBgms.every((k) => postPresence.bgmCached[k]),
        play: postPresence.play === true,
        charAnims: cfg.charAnimKeys.every((k) => postPresence.charAnims[k] === true),
      },
    };
    const newTransferKB = +newResources.reduce((s, r) => s + r.transferKB, 0).toFixed(1);
    log(
      `第 ${i} 轮重进：可玩 ${watch.gameActive}ms 字体 ${watch.font}ms 结算 ${watch.finish}ms BGM ${watch.bgmPlaying}ms` +
        ` playMs=${watch.charsPlay} charAnimsMs=${watch.charAnims}` +
        ` | 复原 字体=${post.restored.font} 结算=${post.restored.finish} BGM=${post.restored.bgm}` +
        ` | 新资源 ${newResources.length} 条 ${newTransferKB}KB | 纹 ${postPage.texMB}MB 音 ${postPage.audioMB}MB`,
    );

    out.cycles.push({
      index: i,
      hall,
      preClick,
      watch,
      newResources,
      newTransferKB,
      post,
    });
    if (i < CYCLES) await sleep(500);
  }
  await ctx.close();
} finally {
  await browser.close();
  SERVER.kill("SIGTERM");
}

if (errs.length) {
  log(`⚠ 页面错误 ${errs.length} 条：${errs.slice(0, 3).join(" | ")}`);
  out.ok = false;
} else {
  out.ok = true;
}
writeFileSync(join(RESULTS, `reentry-${LABEL}.json`), JSON.stringify(out, null, 2));
log(`→ benchmark/results/reentry-${LABEL}.json`);

// A/B/A 链只看尾巴：把判据压成一行，避免 tail -3 截错
const last = out.cycles[out.cycles.length - 1];
log(
  `SUMMARY ${LABEL} level=${LEVEL} net=${NET_NAME} ` +
    `hallTex=${last?.hall.page.texMB} hallAudio=${last?.hall.page.audioMB} releasedF=${last?.hall.released.font} releasedA=${last?.hall.released.bgm} ` +
    `reenterMs=${last?.watch.gameActive} fontMs=${last?.watch.font} bgmMs=${last?.watch.bgmPlaying} restored=${last?.post.restored.font}/${last?.post.restored.finish}/${last?.post.restored.bgm} ok=${out.ok}`,
);
process.exit(out.ok ? 0 : 1);

/**
 * 空闲 CPU/功耗基准（r9）：各驻留态的主线程占用与帧率。
 *
 * 面：用户不操作时页面烧多少 CPU（挂机功耗/风扇/笔记本续航）——v0.333 石板大厅
 * 换肤（幕布 backdrop-filter+floaty）后的驻留成本从未量过（r8 只覆盖连接窗）。
 * 态：menu（大厅驻留）/ temple（选关树）/ game-idle（开局静止无输入）/ game-paused
 * （P 键暂停）/ bg-menu、bg-game（后台标签：forceSetTimeOut 保活循环的真实代价）。
 * 指标（CDP Performance.getMetrics，8s 窗）：
 *   - taskPct：TaskDuration 增量/窗长 ×100（主线程任务时间占比，核心口径）
 *   - scriptPct：ScriptDuration 增量/窗长 ×100
 *   - heapMB：JSHeapUsedSize 端点；fps：__fw.loop.actualFps 端点均值
 * 用法：
 *   node --import tsx benchmark/perf-idle.mjs [--secs 8] [--modes menu,game-idle] --save <label>
 *   node --import tsx benchmark/perf-idle.mjs --noblur ...        # 归因：关幕布 blur
 *   node --import tsx benchmark/perf-idle.mjs --compare <label>
 * 产物：benchmark/results/idle-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = 3564;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "idle-pw";

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const NO_BLUR = process.argv.includes("--noblur");
const argGpu = process.argv.includes("--gpu"); // VM 内真 GPU：有头跑 vmwgfx Xorg（r7 解锁口径）
const argDisplay = process.argv.includes("--display") ? process.argv[process.argv.indexOf("--display") + 1] : ":9";
const SECS = Number(process.argv.includes("--secs") ? process.argv[process.argv.indexOf("--secs") + 1] : 8);
const MODES = (process.argv.includes("--modes") ? process.argv[process.argv.indexOf("--modes") + 1] : "menu,temple,game-idle,game-paused,bg-menu,bg-game").split(",");
const NO_BUILD = process.argv.includes("--no-build");
const log = (...a) => console.log("[idle]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
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
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  const get = (n) => m.find((x) => x.name === n)?.value ?? 0;
  return { task: get("TaskDuration"), script: get("ScriptDuration"), heap: get("JSHeapUsedSize") };
}

/** 一态采样：page 已就位后跑 SECS 秒窗 */
async function sample(label, page, cdp) {
  await sleep(500); // 态切换余波（场景 create/暂停面板弹出）
  const a = await metrics(cdp);
  const fpsA = await page.evaluate(() => globalThis.__fw?.loop?.actualFps ?? 0);
  await sleep(SECS * 1000);
  const b = await metrics(cdp);
  const fpsB = await page.evaluate(() => globalThis.__fw?.loop?.actualFps ?? 0);
  return {
    mode: label,
    taskPct: +(((b.task - a.task) / SECS) * 100).toFixed(1),
    scriptPct: +(((b.script - a.script) / SECS) * 100).toFixed(1),
    heapMB: +(b.heap / 1048576).toFixed(1),
    fps: +(((fpsA + fpsB) / 2).toFixed(1)),
  };
}

const server = await startServer();
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
  headless: !argGpu,
  args: [
    "--mute-audio",
    "--enable-precise-memory-info",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    ...(argGpu ? ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : []),
  ],
  ...(argGpu ? { env: { ...process.env, DISPLAY: argDisplay } } : {}),
});
if (argGpu) log(`VM 内真 GPU 模式: DISPLAY=${argDisplay} 有头 + ignore-gpu-blocklist（期待 renderer=SVGA3D）`);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const bgCtx = await browser.newContext({ viewport: { width: 1280, height: 960 } }); // 后台态专用：默认旗标（不禁节流——真人后台行为）
if (NO_BLUR) {
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "#menu{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.menu-logo{animation:none!important}";
      document.head.appendChild(st);
    });
  });
}
const errs = [];
const a = await ctx.newPage();
a.on("pageerror", (e) => errs.push(String(e)));
const cdp = await ctx.newCDPSession(a);
await cdp.send("Performance.enable");
await a.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
const out = [];

if (MODES.includes("menu")) {
  // 大厅驻留（暖装已就绪；面板可见=真人等朋友的真实态）
  await a.waitForFunction(() => globalThis.__fw?.textures?.exists("ground"), null, { timeout: 30000, polling: 50 });
  out.push(await sample("menu", a, cdp));
}
if (MODES.includes("temple")) {
  // 选关树（走 Menu 画布"开始"按钮同款路径：__fwLeaveToMenu 首次 start() 前未注册）
  await a.evaluate(() => globalThis.__fw?.scene?.getScene("Menu")?.scene?.start("Temple"));
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 30000, polling: 20 });
  out.push(await sample("temple", a, cdp));
}

const needGame = MODES.some((m) => m.startsWith("game") || m.startsWith("bg-game"));
if (needGame) {
  // 双页入房开局
  await a.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
  await a.fill("#password", PASSWORD);
  await a.click("#btn-create");
  await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Game"), null, { timeout: 30000, polling: 20 });
  await a.waitForFunction(() => /房间码\s+[A-Za-z0-9_]{6,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 10000, polling: 100 });
  const code = await a.evaluate(() => document.querySelector("#hud-room")?.textContent?.match(/[A-Za-z0-9_]{6,}/)?.[0] ?? "");
  // 加入方 b 建在 bgCtx（默认旗标 context：真人后台节流行为）——bg 态直接采样 b
  const b = await bgCtx.newPage();
  b.on("pageerror", (e) => errs.push("B:" + String(e)));
  const bCdp = await bgCtx.newCDPSession(b);
  await bCdp.send("Performance.enable");
  await b.goto(`${BASE}/?level=forest_01&room=${code}&pw=${PASSWORD}`, { waitUntil: "domcontentloaded" });
  await b.waitForFunction(() => globalThis.__fw?.scene?.isActive("Game"), null, { timeout: 30000, polling: 40 });
  await a.waitForFunction(() => globalThis.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 30000, polling: 40 });
  await sleep(2000); // 相机收敛

  if (MODES.includes("game-idle")) out.push(await sample("game-idle", a, cdp));
  if (MODES.includes("game-paused")) {
    await a.evaluate(() => globalThis.__fwTogglePause?.());
    await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("PauseMenu"), null, { timeout: 10000, polling: 40 });
    out.push(await sample("game-paused", a, cdp));
    await a.evaluate(() => globalThis.__fwTogglePause?.());
    await a.waitForFunction(() => !globalThis.__fw?.scene?.isActive("PauseMenu"), null, { timeout: 10000, polling: 40 });
  }
  if (MODES.includes("bg-game") || MODES.includes("bg-menu")) {
    // b（默认旗标 context，已入房）用同 context 空白页压后台——Chromium 原生后台节流生效
    const frontPage = await bgCtx.newPage();
    await frontPage.goto("about:blank");
    await frontPage.bringToFront();
    if (MODES.includes("bg-game")) out.push(await sample("bg-game", b, bCdp));
    if (MODES.includes("bg-menu")) {
      await b.evaluate(() => globalThis.__fwLeaveToMenu?.());
      await b.waitForFunction(() => !globalThis.__fw?.scene?.isActive("Game"), null, { timeout: 30000, polling: 100 });
      out.push(await sample("bg-menu", b, bCdp));
    }
    await frontPage.close();
  }
  await b.close();
}

await bgCtx.close();
await browser.close();
server.kill("SIGTERM");

if (errs.length) {
  log("页面错误（失败）：", errs.join("; "));
  process.exit(1);
}
for (const r of out) {
  log(`${r.mode.padEnd(12)} task=${String(r.taskPct).padStart(5)}%  script=${String(r.scriptPct).padStart(5)}%  heap=${r.heapMB}MB  fps=${r.fps}`);
}

const snapshot = {
  meta: { git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(), secs: SECS, noBlur: NO_BLUR, gpu: argGpu },
  results: out,
};
if (argSave) {
  writeFileSync(join(RESULTS, `idle-${argSave}.json`), JSON.stringify(snapshot, null, 2));
  log(`快照：results/idle-${argSave}.json`);
}
if (argCompare) {
  const p = join(RESULTS, `idle-${argCompare}.json`);
  if (!existsSync(p)) { log(`对比快照不存在: ${p}`); process.exit(1); }
  const prev = JSON.parse(readFileSync(p, "utf8"));
  const prevBy = Object.fromEntries(prev.results.map((r) => [r.mode, r]));
  console.log("\n[idle] 前后对比（task%=主线程任务时间占比，script%=JS 执行占比）");
  for (const r of out) {
    const q = prevBy[r.mode];
    if (!q) { console.log(`  ${r.mode.padEnd(12)} ${String("—").padStart(6)} → task=${r.taskPct}%`); continue; }
    const dTask = q.taskPct > 0 ? `${(((r.taskPct - q.taskPct) / q.taskPct) * 100).toFixed(0)}%` : "—";
    console.log(`  ${r.mode.padEnd(12)} task ${String(q.taskPct).padStart(5)}% → ${String(r.taskPct).padStart(5)}% (${dTask})   script ${q.scriptPct}% → ${r.scriptPct}%   fps ${q.fps} → ${r.fps}`);
  }
}

/**
 * 客户端加载性能基准：构建产物冷启动测量（全新无缓存 context）。
 * - 里程碑：goto→DCL→__fw 就绪→Menu active→（建房）→Game active
 * - 资源：请求数 / 传输字节 / 解码字节（按 initiatorType 分组）
 * - 声明资源缓存命中：二次访问（同 context reload）传输字节对比
 *
 * 用法：
 *   node --import tsx benchmark/perf-load.mjs [--no-build] --save <label>
 *   node --import tsx benchmark/perf-load.mjs --no-build --compare <label>
 * 产物：benchmark/results/load-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = 3561;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "load-pw";
const LEVEL = "forest_01";

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const NO_BUILD = process.argv.includes("--no-build");
const log = (...a) => console.log("[load]", ...a);
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

async function resourceStats(page) {
  return page.evaluate(() => {
    const es = performance.getEntriesByType("resource");
    const byType = {};
    let totalTransfer = 0, totalDecoded = 0, count = 0;
    for (const e of es) {
      const t = e.initiatorType || "other";
      byType[t] = byType[t] || { n: 0, transferKB: 0, decodedKB: 0 };
      byType[t].n++;
      byType[t].transferKB += (e.transferSize || 0) / 1024;
      byType[t].decodedKB += (e.decodedBodySize || 0) / 1024;
      totalTransfer += e.transferSize || 0;
      totalDecoded += e.decodedBodySize || 0;
      count++;
    }
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      count,
      totalTransferKB: +(totalTransfer / 1024).toFixed(0),
      totalDecodedKB: +(totalDecoded / 1024).toFixed(0),
      byType,
      domContentLoadedMs: nav ? +nav.domContentLoadedEventEnd.toFixed(0) : null,
    };
  });
}

async function waitSceneActive(page, key, timeout = 30000) {
  const t0 = Date.now();
  await page.waitForFunction((k) => {
    const g = globalThis.__fw;
    return g && g.scene.isActive(k);
  }, key, { timeout, polling: 40 });
  return Date.now() - t0;
}

/** 一轮完整测量：冷 context 深链 → Menu → 建房 → Game；再 reload 测缓存命中 */
async function measureRound(browser, round) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  const t0 = Date.now();
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  const tDom = Date.now();
  await page.waitForFunction(() => !!globalThis.__fw, null, { timeout: 30000 });
  const tFw = Date.now();
  await waitSceneActive(page, "Menu");
  const tMenu = Date.now();
  const cold = {
    domContentLoadedMs: tDom - t0,
    phaserReadyMs: tFw - t0,
    menuActiveMs: tMenu - t0,
    resources: await resourceStats(page),
  };
  // 建房 → Game active
  await page.fill("#password", PASSWORD);
  const tClick = Date.now();
  await page.click("#btn-create");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 20000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  await waitSceneActive(page, "Game");
  const tGame = Date.now();
  cold.gameActiveAfterClickMs = tGame - tClick;
  cold.resourcesAfterGame = await resourceStats(page);
  cold.pageErrors = errs;

  // reload（同 context，浏览器有缓存）→ Menu active 与传输字节
  const r0 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitSceneActive(page, "Menu");
  const warm = {
    menuActiveMs: Date.now() - r0,
    resources: await resourceStats(page),
  };
  await ctx.close();
  return { round, cold, warm };
}

const server = await startServer();
const results = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
  },
  rounds: [],
};
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info"],
});
try {
  for (let i = 1; i <= 2; i++) {
    results.rounds.push(await measureRound(browser, i));
    const r = results.rounds[results.rounds.length - 1];
    log(`round${i}: Menu=${r.cold.menuActiveMs}ms 传输=${r.cold.resources.totalTransferKB}KB/${r.cold.resources.count}req | reload Menu=${r.warm.menuActiveMs}ms 传输=${r.warm.resources.totalTransferKB}KB | Game(点击后)=${r.cold.gameActiveAfterClickMs}ms`);
    if (r.cold.pageErrors.length) log(`round${i} 页面错误:`, r.cold.pageErrors.join("; "));
  }
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400);
  try { server.kill("SIGKILL"); } catch {}
}

// 聚合（两轮取均值）
const avg2 = (a, b) => +(((a + b) / 2).toFixed(1));
const [r1, r2] = results.rounds;
results.summary = {
  cold: {
    menuActiveMs: avg2(r1.cold.menuActiveMs, r2.cold.menuActiveMs),
    transferKB: avg2(r1.cold.resources.totalTransferKB, r2.cold.resources.totalTransferKB),
    requests: Math.round((r1.cold.resources.count + r2.cold.resources.count) / 2),
    gameActiveAfterClickMs: avg2(r1.cold.gameActiveAfterClickMs, r2.cold.gameActiveAfterClickMs),
    transferKBAfterGame: avg2(r1.cold.resourcesAfterGame.totalTransferKB, r2.cold.resourcesAfterGame.totalTransferKB),
  },
  warmReload: {
    menuActiveMs: avg2(r1.warm.menuActiveMs, r2.warm.menuActiveMs),
    transferKB: avg2(r1.warm.resources.totalTransferKB, r2.warm.resources.totalTransferKB),
  },
  pageErrors: r1.cold.pageErrors.concat(r2.cold.pageErrors),
};
console.log("\n=== 汇总（两轮均值）===");
console.log(JSON.stringify(results.summary, null, 2));

if (argSave) {
  writeFileSync(join(RESULTS, `load-${argSave}.json`), JSON.stringify(results, null, 2));
  console.log(`已存档 load-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `load-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  const b = base.summary;
  const c = results.summary;
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${results.meta.git}）=====`);
  console.log(`冷启动 Menu active : ${b.cold.menuActiveMs}ms → ${c.cold.menuActiveMs}ms`);
  console.log(`冷启动传输（Menu） : ${b.cold.transferKB}KB → ${c.cold.transferKB}KB`);
  console.log(`冷启动请求数       : ${b.cold.requests} → ${c.requests}`);
  console.log(`点击建房→Game     : ${b.cold.gameActiveAfterClickMs}ms → ${c.cold.gameActiveAfterClickMs}ms`);
  console.log(`进 Game 累计传输   : ${b.cold.transferKBAfterGame}KB → ${c.cold.transferKBAfterGame}KB`);
  console.log(`reload Menu active : ${b.warmReload.menuActiveMs}ms → ${c.warmReload.menuActiveMs}ms`);
  console.log(`reload 传输        : ${b.warmReload.transferKB}KB → ${c.warmReload.transferKB}KB`);
  if (c.pageErrors.length) { console.log(`⚠ 页面错误：${c.pageErrors.join("; ")}`); process.exitCode = 1; }
}

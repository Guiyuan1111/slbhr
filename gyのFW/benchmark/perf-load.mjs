/**
 * 客户端加载性能基准：构建产物冷启动测量（全新无缓存 context）。
 * - 里程碑：goto→DCL→__fw 就绪→Menu active→（建房）→Game active
 * - 资源：请求数 / 传输字节 / 解码字节（按 initiatorType 分组）
 * - 声明资源缓存命中：二次访问（同 context reload）传输字节对比
 * - r15 起逐 URL 拆账（冷启动归因用）：
 *   · items——每条资源的 传输KB/解码KB/类型 + 相对导航起点的起止毫秒；
 *   · 阶段归位不靠跨时钟对齐（页内 performance.now 与 Node 墙钟不可比），而是
 *     "Menu 时刻快照里存在即属 Menu 前"，两次快照做集合差；
 *   · responses——服务端响应头实况（content-encoding / cache-control / etag / 状态码），
 *     压缩与缓存策略争议以头部实测为准，不读代码推断。
 *   · revalidate——条件复验探测：对幂等同源 GET 各发"无标签整份"与"带 ETag 复验"两次
 *     no-store 请求，直接读出新鲜期过后的两种成本差（件B 的收益口径）；
 *     /matchmake/* 与文档请求有副作用（重复建房），不进探测清单。
 *
 * 用法：
 *   node --import tsx benchmark/perf-load.mjs [--no-build] --save <label>
 *   node --import tsx benchmark/perf-load.mjs --no-build --compare <label>
 * 产物：benchmark/results/load-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
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
    const items = [];
    for (const e of es) {
      const t = e.initiatorType || "other";
      byType[t] = byType[t] || { n: 0, transferKB: 0, decodedKB: 0 };
      byType[t].n++;
      byType[t].transferKB += (e.transferSize || 0) / 1024;
      byType[t].decodedKB += (e.decodedBodySize || 0) / 1024;
      totalTransfer += e.transferSize || 0;
      totalDecoded += e.decodedBodySize || 0;
      count++;
      items.push({
        url: e.name.replace(/^https?:\/\/[^/]+/, ""),
        type: t,
        transferKB: +((e.transferSize || 0) / 1024).toFixed(1),
        decodedKB: +((e.decodedBodySize || 0) / 1024).toFixed(1),
        startMs: +e.startTime.toFixed(0),
        endMs: +e.responseEnd.toFixed(0),
      });
    }
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      count,
      totalTransferKB: +(totalTransfer / 1024).toFixed(0),
      totalDecodedKB: +(totalDecoded / 1024).toFixed(0),
      byType,
      items,
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

/** 条件复验探测（r15 件B 收益直读）：对同一批 URL 各发两次请求——第一次不带标签
 *  （等价"新鲜期已过、整份重下"），第二次带首次拿到的 ETag（等价"新鲜期已过的校验复用"）。
 *  必须用 Node 原生 http 而不是页内 fetch：Blink 在 cache:no-store 下会**丢掉条件请求头**
 *  （no-store 语义即"不做校验复用"），页内测出来的"200 全量"是浏览器行为而非服务器能力，
 *  会把"服务器不支持 ETag"与"客户端没发标签"两种原因混为一谈。
 *  keepAlive 复用连接，贴近真实浏览器连接复用。 */
async function probeRevalidate(urls) {
  return new Promise((resolve, reject) => {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
    const get = (path, headers) =>
      new Promise((res, rej) => {
        const req = http.request({ host: "127.0.0.1", port: PORT, path, agent, headers }, (r) => {
          let bytes = 0;
          r.on("data", (c) => { bytes += c.length; });
          r.on("end", () => res({ status: r.statusCode ?? 0, etag: r.headers.etag ?? null, bytes }));
        });
        req.on("error", rej);
        req.end();
      });
    (async () => {
      const rows = [];
      for (const u of urls) {
        const full = await get(u, { "accept-encoding": "gzip, br" });
        const cond = await get(u, { "accept-encoding": "gzip, br", ...(full.etag ? { "if-none-match": full.etag } : {}) });
        rows.push({
          url: u,
          etag: full.etag ? "yes" : "no",
          refetchKB: +(full.bytes / 1024).toFixed(2),
          revalKB: +(cond.bytes / 1024).toFixed(2),
          status: cond.status,
        });
      }
      agent.destroy();
      resolve(rows);
    })().catch((e) => { agent.destroy(); reject(e); });
  });
}

/** 一轮完整测量：冷 context 深链 → Menu → 建房 → Game；再 reload 测缓存命中 */
async function measureRound(browser, round) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  // 响应头实况（r15）：同一 URL 只记首见（reload 的缓存命中头不作为策略证据）
  const headers = new Map();
  page.on("response", (r) => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, "");
    if (headers.has(u)) return;
    const h = r.headers();
    headers.set(u, {
      url: u,
      status: r.status(),
      enc: h["content-encoding"] ?? "-",
      cc: h["cache-control"] ?? "-",
      etag: h["etag"] ? "yes" : "no",
    });
  });
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
  const menuUrls = new Set(cold.resources.items.map((i) => i.url));
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
  // 阶段归位：Menu 快照里已存在 = Menu 前；进 Game 快照里新增的 = 点建房→Game 段。
  // （不拿页内 performance.now 与 Node 墙钟对齐——两钟不可比，集合差是唯一可靠判据）
  cold.resources.items.forEach((i) => { i.phase = "menu"; });
  cold.resources.menuKB = +cold.resources.items.reduce((s, i) => s + i.transferKB, 0).toFixed(0);
  cold.resources.gamePhaseKB = +cold.resourcesAfterGame.items
    .filter((i) => !menuUrls.has(i.url))
    .reduce((s, i) => s + i.transferKB, 0).toFixed(0);
  cold.resourcesAfterGame.items.forEach((i) => { i.phase = menuUrls.has(i.url) ? "menu" : "game"; });
  cold.headers = [...headers.values()];

  // reload（同 context，浏览器有缓存）→ Menu active 与传输字节
  const r0 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitSceneActive(page, "Menu");
  const warm = {
    menuActiveMs: Date.now() - r0,
    resources: await resourceStats(page),
  };
  // 条件复验探测（件B）：只探幂等的同源静态/数据 GET。blob: 无服务器语义；
  // /matchmake/* 与文档请求有副作用（再打一次=再建一间房），一律排除。
  const probeUrls = [...headers.values()]
    .map((h) => h.url)
    .filter((u) => !u.startsWith("blob:") && !u.startsWith("/matchmake") && !u.startsWith("/?"));
  cold.revalidate = await probeRevalidate(probeUrls);
  cold.revalidateSummary = {
    urls: cold.revalidate.length,
    refetchKB: +cold.revalidate.reduce((s, x) => s + x.refetchKB, 0).toFixed(1),
    revalKB: +cold.revalidate.reduce((s, x) => s + x.revalKB, 0).toFixed(1),
    notConditional: cold.revalidate.filter((x) => x.status !== 304).map((x) => x.url),
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
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
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
    menuPhaseKB: avg2(r1.cold.resources.menuKB, r2.cold.resources.menuKB),
    gamePhaseKB: avg2(r1.cold.resources.gamePhaseKB, r2.cold.resources.gamePhaseKB),
    revalProbe: {
      urls: r1.cold.revalidateSummary.urls,
      refetchKB: r1.cold.revalidateSummary.refetchKB,
      revalKB: r1.cold.revalidateSummary.revalKB,
      notConditional304: r1.cold.revalidateSummary.notConditional,
    },
  },
  warmReload: {
    menuActiveMs: avg2(r1.warm.menuActiveMs, r2.warm.menuActiveMs),
    transferKB: avg2(r1.warm.resources.totalTransferKB, r2.warm.resources.totalTransferKB),
  },
  pageErrors: r1.cold.pageErrors.concat(r2.cold.pageErrors),
};
// 逐 URL 归因表（round1，取进 Game 后的全量快照以覆盖两段）
const table = r1.cold.resourcesAfterGame.items
  .filter((i) => i.transferKB >= 1)
  .sort((a, b) => b.transferKB - a.transferKB);
console.log("\n=== Menu 前 / 进房段 传输拆账 ===");
console.log(`Menu 前 ${results.summary.cold.menuPhaseKB}KB，点建房→Game 段 ${results.summary.cold.gamePhaseKB}KB（round1 明细，≥1KB）`);
for (const i of table) {
  console.log(`  ${String(i.transferKB).padStart(7)}KB→${String(i.decodedKB).padStart(8)}KB  ${i.phase.padEnd(4)} ${i.type.padEnd(7)} @${String(i.startMs).padStart(5)}-${String(i.endMs).padStart(5)}ms  ${i.url}`);
}
const bigByUrl = new Map(r1.cold.resourcesAfterGame.items.map((i) => [i.url, i.decodedKB]));
const uncom = r1.cold.headers.filter((h) => h.enc === "-" && (bigByUrl.get(h.url) ?? 0) >= 64);
console.log(`\n=== 未压缩且 ≥64KB 的响应（round1）===`);
for (const h of uncom) console.log(`  ${h.status} ${h.cc}  etag=${h.etag}  ${h.url}`);
const rv = results.summary.cold.revalProbe;
console.log(`\n=== 条件复验探测（round1，${rv.urls} 个幂等 URL）===`);
console.log(`  整份重下 ${rv.refetchKB}KB → 带 ETag 复验 ${rv.revalKB}KB（省 ${(rv.refetchKB - rv.revalKB).toFixed(1)}KB）`);
const bad = rv.notConditional304;
if (bad.length) console.log(`  ⚠ 未命中 304（${bad.length} 个，无 ETag 或服务器不支持条件请求）：${bad.join(", ")}`);
console.log(`\n=== 汇总（两轮均值）===`);
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
  console.log(`冷启动请求数       : ${b.cold.requests} → ${c.cold.requests}`);
  console.log(`点击建房→Game     : ${b.cold.gameActiveAfterClickMs}ms → ${c.cold.gameActiveAfterClickMs}ms`);
  console.log(`进 Game 累计传输   : ${b.cold.transferKBAfterGame}KB → ${c.cold.transferKBAfterGame}KB`);
  // r15 起新字段：旧快照无对应值，打 "-" 兼容（口径同 perf-client r7r）
  const p = (k) => `${b.cold[k] ?? "-"} → ${c.cold[k] ?? "-"}`;
  console.log(`其中 Menu 前传输    : ${p("menuPhaseKB")}`);
  console.log(`其中进房段传输    : ${p("gamePhaseKB")}`);
  const bRv = b.cold.revalProbe;
  console.log(`条件复验探测      : ${bRv ? `${bRv.refetchKB}KB→${bRv.revalKB}KB` : "-"} → ${c.cold.revalProbe ? `${c.cold.revalProbe.refetchKB}KB→${c.cold.revalProbe.revalKB}KB` : "-"}`);
  console.log(`reload Menu active : ${b.warmReload.menuActiveMs}ms → ${c.warmReload.menuActiveMs}ms`);
  console.log(`reload 传输        : ${b.warmReload.transferKB}KB → ${c.warmReload.transferKB}KB`);
  if (c.pageErrors.length) { console.log(`⚠ 页面错误：${c.pageErrors.join("; ")}`); process.exitCode = 1; }
}

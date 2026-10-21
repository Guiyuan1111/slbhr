/**
 * 帧内分配归因基准（r13 起）：CDP 采样堆分析器（HeapProfiler.startSampling）在生产构建的
 * 游戏页上按字节采样分配，把"分配速率 KB/s"这一个标量拆成【函数级】明细。
 *
 * 为什么需要它：r3 把客户端 update 段分配打到 −97% 之后，perf-client 只剩一个总量数字
 * （f01 canvas ≈1044KB/s、fb2 ≈2246KB/s），r12 收掉的平台位姿对象字面量只是其中可推算的一段。
 * 剩余份额无名为先前的优化只能猜；本工具用采样器给出"哪个函数分配了多少字节"的直接证据。
 *
 * 口径：
 *   - 采样窗 = phase=started 后再静置 2s（相机弹簧/机关平滑收敛）→ startSampling → SECS → stopSampling；
 *     与 perf-client 的采样窗完全同构（同关卡、同入房流程、同 canvas/webgl 双渲染器语义），
 *     因此 allocKBs 可与 perf-client 的对应字段交叉校验（两者相差应 <30%，超出即量具有问题）。
 *   - V8 采样堆分析器按平均 samplingInterval 字节取一个样本，样本记在**发生分配的栈帧**上
 *     （selfSize 为浅归因，inclusiveSize 为子树合计=深归因）；两个口径都出，判读用 self 排序、
 *     找路径用 inclusive。
 *   - 绝对值是采样估计（∑selfSize 需按 采样率 还原）；本工具同时打印 sampledTotal 与
 *     total/samplingInterval 的还原估计，并把 KB/s 直接标出——**A/B 相对比较有效**。
 *     **实测口径（r13 定标）**：V8 采样器每个样本记的是"被抽中对象自身字节"，不是区间字节，
 *     故 sampledTotal 与 perf-client 的 allocKBs 不同量纲、不可直列（本工具 6s 窗恒 ≈20KB，
 *     而同期 allocKBs≈1044KB/s）；样本数 ∝ 1/samplingInterval（interval 4096→5 个、512→36 个）。
 *     因此本工具只用于**份额归因**（谁占 sampledTotal 的百分之几），缺省 interval=256，
 *     且 samples<200 时打印无统计意义警告。
 *   - 生产构建是压缩产物，函数名/行列号不可读；--map 走 source-map-js 把 scriptURL:line:col
 *     还原到 TS 源（需 `vite build --sourcemap` 产出 dist/assets/*.js.map）。--map 关时按
 *     chunk 归属（index/phaser/colyseus）聚合，仍足以判"我们的代码 vs 引擎 vs 网络层"。
 *
 * 用法：
 *   node benchmark/perf-alloc.mjs [--level forest_01] [--secs 8] [--interval 16384]
 *                                 [--renderer canvas|webgl] [--map] [--top 25]
 *                                 --save <label> [--compare <label>]
 *   # 需要可读归因时先出带图的构建（跑完记得 npm run build 复纯产物）：
 *   #   npx vite build --sourcemap
 * 产物：benchmark/results/alloc-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const DIST_ASSETS = join(ROOT, "packages", "client", "dist", "assets");
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const has = (n) => args.includes(`--${n}`);
const LEVEL = argOf("level", "forest_01");
const SECS = Number(argOf("secs", "8"));
const INTERVAL = Number(argOf("interval", "256"));
const RENDERER = argOf("renderer", "canvas");
const TOP = Number(argOf("top", "25"));
const USE_MAP = has("map");
const PORT = Number(argOf("port", "3618"));
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
const log = (...a) => console.log("[alloc]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function localIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) if (ni.family === "IPv4" && !ni.internal) return ni.address;
  }
  throw new Error("未找到非 lo IPv4 地址");
}
const BASE = `http://127.0.0.1:${PORT}`;

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
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用（--port 换口）")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

async function enterAs(page, mode, roomCode) {
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "client-pw");
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}

/** 采样堆 profile → 按栈帧聚合（self 浅归因 / inclusive 深归因） */
function aggregate(profile) {
  const byFrame = new Map();
  let total = 0;
  const visit = (node, ancestors) => {
    const cf = node.callFrame || {};
    const key = `${cf.functionName || "(anonymous)"}|${cf.url || "none"}|${cf.lineNumber ?? -1}|${cf.columnNumber ?? -1}`;
    let e = byFrame.get(key);
    if (!e) {
      e = { key, self: 0, inclusive: 0, functionName: cf.functionName || "(anonymous)", url: cf.url || "", lineNumber: cf.lineNumber ?? -1, columnNumber: cf.columnNumber ?? -1, chain: ancestors.slice(-4) };
      byFrame.set(key, e);
    }
    const sz = node.selfSize || 0;
    e.self += sz;
    e.inclusive += sz;
    total += sz;
    const next = sz > 0 ? [...ancestors, cf.functionName || "(anonymous)"] : ancestors;
    for (const c of node.children || []) e.inclusive += visit(c, next);
    return e.inclusive;
  };
  visit(profile.head, []);
  return { rows: [...byFrame.values()], total };
}

/** 把 scriptURL:line:col 还原到 TS 源（source-map-js；无 .map 时原样返回） */
async function resolveSources(rows) {
  if (!USE_MAP) {
    return rows.map((r) => ({ ...r, src: r.url.replace(/^https?:\/\/[^/]+/, "").slice(-46), chunk: chunkOf(r.url) }));
  }
  let mod;
  try {
    const ns = await import("source-map-js");
    mod = ns.SourceMapConsumer ? ns : ns.default;
    if (!mod?.SourceMapConsumer) throw new Error("无 SourceMapConsumer");
  } catch {
    log("source-map-js 不可用，退回原始位置");
    return rows.map((r) => ({ ...r, src: posOf(r), chunk: chunkOf(r.url) }));
  }
  const maps = new Map();
  const load = (url) => {
    if (maps.has(url)) return maps.get(url);
    const m = url.match(/\/assets\/([^/?#]+\.js)(?:[#?][^]*)?$/);
    let sm = null;
    if (m) {
      const p = join(DIST_ASSETS, m[1] + ".map");
      if (existsSync(p)) {
        try { sm = new mod.SourceMapConsumer(readFileSync(p, "utf8")); } catch { sm = null; }
      }
    }
    maps.set(url, sm);
    return sm;
  };
  return rows.map((r) => {
    const sm = load(r.url);
    if (!sm) return { ...r, src: posOf(r), chunk: chunkOf(r.url) };
    let out = posOf(r);
    try {
      const o = sm.originalPositionFor({ line: r.lineNumber + 1, column: r.columnNumber, bias: mod.GREATEST_LOWER_BOUND });
      if (o && o.source) out = `${o.source.replace(/^.*packages\//, "")}:${o.line ?? 0}:${o.column ?? 0}`;
    } catch { /* 原样 */ }
    return { ...r, src: out, chunk: chunkOf(r.url) };
  });
}

const posOf = (r) => `${r.url.split("/").slice(-1)[0] || r.url}:${r.lineNumber}:${r.columnNumber}`;
const chunkOf = (u) => {
  const f = (u || "").split("/").pop().split("?")[0] || "";
  if (!f) return "other";
  if (f.startsWith("phaser")) return "phaser";
  if (f.startsWith("colyseus")) return "colyseus";
  if (f.startsWith("index")) return "app";
  return f.split("-")[0];
};

function printTable(title, rows, secs) {
  console.log(`\n=== ${title}（top ${Math.min(TOP, rows.length)}）===`);
  console.log("  self KB/s | incl KB/s | share | chunk | frame @ src");
  for (const r of rows) {
    const sh = ((r.self / (rows[0]?.totalRef || 1)) * 100).toFixed(1);
    console.log(`  ${(r.self / 1024 / secs).toFixed(2).padStart(9)} | ${(r.inclusive / 1024 / secs).toFixed(2).padStart(10)} | ${sh.padStart(5)} | ${r.chunk.padEnd(8)} | ${r.functionName} @ ${r.src}`);
  }
}

const server = await startServer();
let browser;
let result;
try {
  browser = await chromium.launch({
    channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  if (RENDERER === "canvas") {
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
        return orig.call(this, type, ...rest);
      };
    });
  }
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const errs = [];
  a.on("pageerror", (e) => errs.push(String(e)));
  b.on("pageerror", (e) => errs.push(String(e)));
  const code = await enterAs(a, "create", "");
  await enterAs(b, "join", code);
  await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
  await sleep(2000);

  const cdp = await ctx.newCDPSession(a);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: INTERVAL });
  const t0 = Date.now();
  await sleep(SECS * 1000);
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  const winSecs = (Date.now() - t0) / 1000;
  await cdp.send("HeapProfiler.disable");
  const sampleCount = profile?.samples?.length ?? 0;
  log(`采样窗 ${winSecs.toFixed(2)}s  samples=${sampleCount} head.children=${profile?.head?.children?.length ?? "-"}（samples<200 归因无统计意义，请降 --interval 或加 --secs）`);

  const { rows, total } = aggregate(profile);
  const resolved = await resolveSources(rows);
  const withRef = resolved.map((r) => ({ ...r, totalRef: total || 1 }));
  const bySelf = [...withRef].sort((x, y) => y.self - x.self).slice(0, TOP);
  const byIncl = [...withRef].sort((x, y) => y.inclusive - x.inclusive).slice(0, TOP);

  const byChunk = new Map();
  for (const r of resolved) byChunk.set(r.chunk, (byChunk.get(r.chunk) || 0) + r.self);
  const chunkList = [...byChunk.entries()].map(([c, v]) => ({ chunk: c, self: v, kb: +(v / 1024 / winSecs).toFixed(1) }))
    .sort((x, y) => y.self - x.self);

  log(`采样窗 ${winSecs.toFixed(2)}s  sampledTotal=${(total / 1024).toFixed(1)}KB  ≈${(total / 1024 / winSecs).toFixed(1)}KB/s  帧=${rows.length} 个不同栈帧  interval=${INTERVAL}B  renderer=${RENDERER}${USE_MAP ? "  map=on" : ""}`);
  console.log("  按 chunk 归口：" + chunkList.map((c) => `${c.chunk} ${c.kb}KB/s`).join("  |  "));
  printTable("self 浅归因（谁直接分配）", bySelf, winSecs);
  printTable("inclusive 深归因（谁引出的分配）", byIncl, winSecs);
  if (errs.length) log("页面错误:", errs.join("; "));

  result = {
    meta: {
      label: argSave || "adhoc", level: LEVEL, secs: +winSecs.toFixed(2), renderer: RENDERER, interval: INTERVAL, map: USE_MAP,
      git: (() => { try { return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { return "?"; } })(),
      date: new Date().toISOString(), node: process.version,
    },
    sampledTotalKB: +(total / 1024).toFixed(1),
    sampleCount,
    allocKBs: +(total / 1024 / winSecs).toFixed(1),
    distinctFrames: rows.length,
    pageErrors: errs,
    chunks: chunkList,
    topSelf: bySelf.map(({ totalRef, ...r }) => r),
    topInclusive: byIncl.map(({ totalRef, ...r }) => r),
  };
} finally {
  if (browser) await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400);
  try { server.kill("SIGKILL"); } catch {}
}

if (argSave && result) {
  if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });
  const p = join(RESULTS, `alloc-${argSave}.json`);
  writeFileSync(p, JSON.stringify(result, null, 2));
  log("已存档 →", p.split("/").slice(-1)[0]);
}

if (argCompare) {
  if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });
  const prev = JSON.parse(readFileSync(join(RESULTS, `alloc-${argCompare}.json`), "utf8"));
  if (!result) { log("本次无采样结果，仅列快照"); process.exit(0); }
  const cur = new Map(result.topSelf.map((r) => [r.key, r]));
  const old = new Map(prev.topSelf.map((r) => [r.key, r]));
  const keys = [...new Set([...cur.keys(), ...old.keys()])];
  console.log(`\n=== 归因前后对比（${argCompare} → ${argSave || "adhoc"}，KB/s self）===`);
  console.log("  前 → 后  Δ%   frame @ src");
  const rows = keys.map((k) => {
    const before = (old.get(k)?.self ?? 0) / 1024 / prev.meta.secs;
    const after = (cur.get(k)?.self ?? 0) / 1024 / result.meta.secs;
    const info = cur.get(k) || old.get(k);
    return { before, after, k, info };
  }).sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before));
  for (const r of rows.slice(0, TOP)) {
    const d = r.before > 0 ? (((r.after - r.before) / r.before) * 100).toFixed(1) + "%" : "new";
    console.log(`  ${r.before.toFixed(2)} → ${r.after.toFixed(2)}  ${String(d).padStart(8)}  ${r.info.functionName} @ ${r.info.src}`);
  }
  console.log(`  总量 ${prev.allocKBs} → ${result.allocKBs} KB/s（${(((result.allocKBs - prev.allocKBs) / prev.allocKBs) * 100).toFixed(1)}%）`);
}

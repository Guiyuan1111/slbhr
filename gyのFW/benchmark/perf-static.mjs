/**
 * 静态资源服务基准（r50 新增）：`staticGz` 的真实 HTTP 响应成本。
 *
 * ## 为什么需要
 * 前 48 轮的服务端量具（`perf-step` / `perf-server-alloc` / `perf-capacity` /
 * `perf-sync` / `perf-switch`）量的全是**游戏房内的物理与网络路径**，**没有一件量过
 * 静态资源服务**。而 `packages/client/dist` 有 278 个可压缩文件，一次冷启动要拉
 * 3 个 JS chunk（1.4MB + 139KB + 129KB）+ 图集 json + 关卡 json。
 *
 * `staticGz.ts` 的请求路径上有三处**同步**操作：
 *   1. `fs.statSync(fpAbs)` —— 每个请求都跑
 *   2. `fs.readFileSync(fpAbs)` —— 仅首次压缩
 *   3. `zlib.brotliCompressSync(...)` —— 仅首次压缩（1.4MB 的同步 brotli）
 * 同步 = 直接阻塞事件循环。服务端同时跑着 N 个游戏房，这比异步等待严重。
 *
 * ## 口径（为什么用真 HTTP 而非直接调中间件）
 * 战役支柱 2「基准必须镜像生产语义」。首版直接 mock req/res 调中间件，遇到两个坑：
 * `compCache` 是模块级私有、清不掉（冷测从第二轮起就是热缓存）；mock res 缺
 * `getHeader` 时 express.static 的异步回调会崩。**改用真服 + 真 HTTP 请求**：
 * 冷/热靠「重启服务进程」区分，不靠猜。
 *
 * 测量项（`fetch` 计时，含网络栈）：
 *   - `cold`     —— 服务刚起、首次请求该文件（触发 readFile + brotli）
 *   - `warm`     —— compCache 已填（真实稳态：玩家刷新页面）
 *   - `revalidate` —— 带 If-None-Match（304 路径）
 *   - `burst`    —— 并发拉首屏 chunk，看总墙钟（事件循环阻塞的直接表现）
 *
 * 用法：
 *   node --import tsx benchmark/perf-static.mjs
 *   ROUNDS=9 node --import tsx benchmark/perf-static.mjs --save r50-baseline
 *   node --import tsx benchmark/perf-static.mjs --compare r50-baseline
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const DIST = join(ROOT, "packages", "client", "dist");
const PORT = Number(process.env.PORT ?? 3661);
const BASE = `http://127.0.0.1:${PORT}`;
const ROUNDS = Number(process.env.ROUNDS ?? 9);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

if (!existsSync(DIST)) {
  console.error(`[static] 缺 ${DIST}——先 \`npm run build\``);
  process.exit(1);
}

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
function stopServer(child) {
  return new Promise((res) => { child.once("exit", () => res()); child.kill("SIGTERM"); setTimeout(res, 3000); });
}

/** 找到实际的构建产物路径（哈希会随构建变化） */
function resolveAssets() {
  const dir = join(DIST, "assets");
  const out = [];
  for (const [label, re] of [["phaser", /^phaser-.*\.js$/], ["index", /^index-.*\.js$/], ["colyseus", /^colyseus-.*\.js$/]]) {
    const f = readdirSync(dir).find((n) => re.test(n));
    if (f) out.push({ label, url: `/assets/${f}`, bytes: statSync(join(dir, f)).size });
  }
  for (const [label, url] of [
    ["level json", "/data/forest/levels/forest_01.json"],
    ["temple json", "/data/forest/temple.json"],
  ]) {
    try { if (statSync(join(DIST, url)).isFile()) out.push({ label, url, bytes: statSync(join(DIST, url)).size }); } catch { /* 缺则跳过 */ }
  }
  return out;
}

async function timedFetch(url, headers = {}) {
  const t0 = performance.now();
  const r = await fetch(BASE + url, { headers });
  await r.arrayBuffer(); // 读完正文，否则只测了 TTFB
  return { ms: performance.now() - t0, status: r.status, headers: r.headers };
}

const assets = resolveAssets();
if (!assets.length) { console.error("[static] 未找到任何可测文件"); process.exit(1); }

const summary = [];
const rows = [];
let srv = await startServer();

console.log(`\n静态资源服务（真 HTTP，${assets.length} 个文件，各 ${ROUNDS} 轮）`);
console.log("  文件               大小      操作        中位(ms)   区间(ms)");

try {
  // ── 冷：服务刚起，每个文件第一次请求 ──
  for (const a of assets) {
    if (srv === null) srv = await startServer();
    const r = await timedFetch(a.url);
    rows.push({ file: a.label, bytes: a.bytes, op: "cold", med: +r.ms.toFixed(2), min: +r.ms.toFixed(2), max: +r.ms.toFixed(2), status: r.status });
  }

  // ── 热：缓存已填，重复请求 ──
  for (const a of assets) {
    const times = [];
    for (let i = 0; i < ROUNDS * 5; i++) times.push((await timedFetch(a.url)).ms);
    const srt = [...times].sort((x, y) => x - y);
    rows.push({ file: a.label, bytes: a.bytes, op: "warm", med: +med(times).toFixed(2), min: +srt[0].toFixed(2), max: +srt[srt.length - 1].toFixed(2) });
  }

  // ── 304：带 If-None-Match ──
  for (const a of assets) {
    const probe = await timedFetch(a.url);
    const etag = probe.headers.get("etag");
    if (!etag) { console.error(`  ✗ ${a.label} 无 ETag`); continue; }
    const times = [];
    let bad = 0;
    for (let i = 0; i < ROUNDS * 5; i++) {
      const r = await timedFetch(a.url, { "if-none-match": etag });
      times.push(r.ms);
      if (r.status !== 304) bad++;
    }
    if (bad) console.error(`  ✗ ${a.label} 期望 304，${bad} 次不符`);
    const srt = [...times].sort((x, y) => x - y);
    rows.push({ file: a.label, bytes: a.bytes, op: "revalidate", med: +med(times).toFixed(2), min: +srt[0].toFixed(2), max: +srt[srt.length - 1].toFixed(2) });
  }

  // ── burst：并发拉首屏 3 chunk（同步阻塞的直接表现） ──
  const boot = assets.filter((a) => ["phaser", "index", "colyseus"].includes(a.label));
  if (boot.length) {
    const times = [];
    for (let i = 0; i < ROUNDS * 3; i++) {
      const t0 = performance.now();
      await Promise.all(boot.map((a) => timedFetch(a.url)));
      times.push(performance.now() - t0);
    }
    const srt = [...times].sort((x, y) => x - y);
    rows.push({ file: "首屏 3 chunk", bytes: boot.reduce((s, a) => s + a.bytes, 0), op: "burst(warm)", med: +med(times).toFixed(2), min: +srt[0].toFixed(2), max: +srt[srt.length - 1].toFixed(2) });
  }

  // ── 冷 burst：重启服务后再并发拉（真·首次压缩的并发阻塞） ──
  if (boot.length) {
    await stopServer(srv); srv = null;
    srv = await startServer();
    const times = [];
    for (let i = 0; i < ROUNDS; i++) {
      if (i > 0) { await stopServer(srv); srv = await startServer(); }
      const t0 = performance.now();
      await Promise.all(boot.map((a) => timedFetch(a.url)));
      times.push(performance.now() - t0);
    }
    const srt = [...times].sort((x, y) => x - y);
    rows.push({ file: "首屏 3 chunk", bytes: boot.reduce((s, a) => s + a.bytes, 0), op: "burst(cold)", med: +med(times).toFixed(2), min: +srt[0].toFixed(2), max: +srt[srt.length - 1].toFixed(2) });
  }
} finally {
  if (srv) await stopServer(srv);
}

for (const r of rows) {
  console.log(
    `  ${r.file.padEnd(18)} ${String(Math.round(r.bytes / 1024)).padStart(5)}KB  ${r.op.padEnd(11)}` +
    ` ${String(r.med).padStart(8)}   [${r.min}–${r.max}]${r.status && r.status !== 200 ? `  ⚠${r.status}` : ""}`,
  );
  summary.push(r);
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `static-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rounds: ROUNDS, summary }, null, 1));
  console.log(`\n快照已存 ${out}`);
}
if (argCompare) {
  const f = join(RESULTS, `static-${argCompare}.json`);
  if (!existsSync(f)) console.error("[static] 对比基线不存在:", f);
  else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    console.log(`\n对比 ${argCompare}（中位，ms）：`);
    for (const s of summary) {
      const prev = base.summary.find((x) => x.file === s.file && x.op === s.op);
      if (!prev) continue;
      const d = ((s.med - prev.med) / prev.med) * 100;
      console.log(`  ${(s.file + " / " + s.op).padEnd(32)} ${String(prev.med).padStart(8)} → ${String(s.med).padStart(8)}  ${(d >= 0 ? "+" : "") + d.toFixed(1)}%`);
    }
  }
}

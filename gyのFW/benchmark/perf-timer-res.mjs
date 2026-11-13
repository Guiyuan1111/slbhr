/**
 * 页内时钟分辨率测定（r53 新增，产品化自 r51 的 TEMP/r51/timer-res.mjs）。
 *
 * ## 为什么存在
 * r51 发现本环境（headless Chromium，非 crossOriginIsolated）的
 * `performance.now()` 量化到 100µs（Chrome 对非隔离上下文的计时器粗化），
 * 导致 r50 分段表亚百微秒段全部作废、r51/r52 多项页面口径「不主张」。
 * r53 给服务端加 COOP/COEP 响应头（跨源隔离，本身是安全加固）后，
 * 隔离上下文的时钟粒度应从 100µs 解除到 ~5µs——本量具是这条链路的验收件。
 *
 * ## 口径
 * 真实页面连采 N 个 `performance.now()` 差值，输出：
 *   - `isolated`：self.crossOriginIsolated 标志
 *   - `vals`：全部非零差值（量化粒度直接可见）
 *   - `minPositive`：最小非零差值（≈ 粒度上界）
 *   - `zeros`：零差值占比
 * 附 `Date.now()` 最小正差值对照（Chrome 对非隔离上下文同样粗化 Date）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-timer-res.mjs --save r53-base   # 加头前
 *   node --import tsx benchmark/perf-timer-res.mjs --save r53-coop   # 加头后
 *   SAMPLES=20000 PORT=3679 node --import tsx benchmark/perf-timer-res.mjs
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3679);
const SAMPLES = Number(process.env.SAMPLES ?? 20000);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
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

// 只需页面加载（同源任一文档），不需要进房——时钟属性是页面上下文级的。
const server = await startServer();
const browser = await chromium.launch({ headless: true });
let res;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 30000 });
  res = await page.evaluate(async (samples) => {
    // 预热排掉首次调用差
    let prev = performance.now();
    for (let i = 0; i < 100; i++) prev = performance.now();
    const deltas = [];
    for (let i = 0; i < samples; i++) {
      const t = performance.now();
      deltas.push(t - prev);
      prev = t;
    }
    const counts = new Map();
    let zeros = 0;
    for (const d of deltas) {
      if (d === 0) { zeros++; continue; }
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const vals = [...counts.keys()].sort((a, b) => a - b);
    // Date.now 对照
    let dp = Date.now();
    let dMin = Infinity;
    for (let i = 0; i < 20000; i++) {
      const t = Date.now();
      if (t - dp > 0) dMin = Math.min(dMin, t - dp);
      dp = t;
    }
    return {
      isolated: self.crossOriginIsolated ?? false,
      coop: self.crossOriginOpenerPolicy ?? null,
      coep: self.crossOriginEmbedderPolicy ?? null,
      vals,
      minPositive: vals.length ? vals[0] : 0,
      zeros,
      zeroRatio: zeros / samples,
      dateMinPositive: Number.isFinite(dMin) ? dMin : -1,
    };
  }, SAMPLES);
  await page.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

const pct = (v) => (v * 100).toFixed(1) + "%";
console.log(`\n页内时钟分辨率（${SAMPLES} 次采样）\n`);
console.log(`  crossOriginIsolated       ${res.isolated}`);
console.log(`  COOP/COEP（页视角）        ${String(res.coop)} / ${String(res.coep)}`);
console.log(`  非零差值集合              [${res.vals.join(", ")}] ms`);
console.log(`  最小正差值                ${res.minPositive} ms`);
console.log(`  零差值占比                ${pct(res.zeroRatio)}`);
console.log(`  Date.now 最小正差值       ${res.dateMinPositive} ms`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `timerres-${argSave}.json`);
  writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), samples: SAMPLES, ...res }, null, 1));
  console.log(`\n[timer-res] 快照已存 ${f}`);
}

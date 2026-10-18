// CDP Tracing：devtools.timeline，主线程耗时分桶（JS/渲染/绘制/GC/其他）
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3602;
const MODE = process.argv.includes("--replay") ? "replay" : "idle";
const SECS = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 60000);
    const ondata = (buf) => { const s = String(buf); if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("EADDRINUSE")); } else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); } };
    child.stdout.on("data", ondata); child.stderr.on("data", () => {}); child.on("exit", (c) => reject(new Error("exit " + c)));
  });
}
async function enterAs(page, mode, code) {
  await page.goto(`http://127.0.0.1:${PORT}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "pw");
  if (mode === "join") await page.fill("#roomcode", code);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}
const server = await startServer();
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--enable-precise-memory-info"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return orig.call(this, type, ...rest);
    };
  });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const code = await enterAs(a, "create", "");
  await enterAs(b, "join", code);
  await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
  await sleep(2000);
  const cdp = await ctx.newCDPSession(a);
  const events = [];
  cdp.on("Tracing.dataCollected", (d) => events.push(...d.value));
  await new Promise((res) => { cdp.on("Tracing.tracingComplete", res); cdp.send("Tracing.start", { categories: "devtools.timeline", transferMode: "ReturnAsStream", options: "sampling-frequency=10000" }).then(() => {}); });
  await sleep(SECS * 1000);
  await cdp.send("Tracing.end");
  await sleep(1500);
  // 分桶：完整（X）事件按 name 聚合 dur；主线程 pid/tid 取 TimerFire/FunctionCall 所在
  const byName = new Map();
  let totalDur = 0, n = 0;
  for (const e of events) {
    if (e.ph !== "X" || typeof e.dur !== "number") continue;
    byName.set(e.name, (byName.get(e.name) ?? 0) + e.dur);
    totalDur += e.dur; n++;
  }
  const top = [...byName.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => [k, +(v / 1000).toFixed(1)]);
  console.log(`mode=${MODE} ${SECS}s 完整事件 ${n} 个 总 dur=${(totalDur / 1000).toFixed(0)}ms`);
  for (const [k, v] of top) console.log(String(v).padStart(9), "ms", k);
  writeFileSync(join(ROOT, "TEMP", "perfopt3", `trace-${MODE}-top.json`), JSON.stringify({ mode: MODE, secs: SECS, top }, null, 1));
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

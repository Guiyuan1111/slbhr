// 短窗 heap 采样（300ms×8 片）：对象尚未被 GC，采样即分配点
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3603;
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
function agg(profile) {
  const selfByFn = new Map();
  const walk = (node) => {
    const cf = node.callFrame;
    const url = (cf.url || "").replace(/^.*\/dist\//, "dist/").replace(/^.*\/node_modules\//, "nm/");
    const key = `${cf.functionName || "(anon)"} @ ${url}:${cf.lineNumber + 1}`;
    if (node.selfSize > 0) selfByFn.set(key, (selfByFn.get(key) ?? 0) + node.selfSize);
    for (const c of node.children ?? []) walk(c);
  };
  walk(profile.head);
  return selfByFn;
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
  await sleep(2500);
  const cdp = await ctx.newCDPSession(a);
  await cdp.send("HeapProfiler.enable");
  const aggAll = new Map();
  const SLICES = 8, WIN = 300;
  for (let i = 0; i < SLICES; i++) {
    await cdp.send("HeapProfiler.startSampling", { samplingInterval: 256 });
    await sleep(WIN);
    const { profile } = await cdp.send("HeapProfiler.stopSampling");
    for (const [k, v] of agg(profile)) aggAll.set(k, (aggAll.get(k) ?? 0) + v);
  }
  const top = [...aggAll.entries()].sort((x, y) => y[1] - x[1]).slice(0, 35);
  const total = [...aggAll.values()].reduce((x, y) => x + y, 0);
  const secs = (SLICES * WIN) / 1000;
  console.log(`短窗采样 ${SLICES}×${WIN}ms：共 ${(total / 1024).toFixed(0)}KB ≈ ${(total / 1024 / secs).toFixed(0)}KB/s`);
  for (const [k, v] of top) console.log(String((v / 1024).toFixed(1)).padStart(9), "KB", k);
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

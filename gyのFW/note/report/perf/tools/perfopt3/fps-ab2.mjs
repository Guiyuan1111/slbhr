import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3595;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 60000);
    const ondata = (buf) => { const s = String(buf); if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("EADDRINUSE")); } else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); } };
    child.stdout.on("data", ondata); child.stderr.on("data", () => {}); child.on("exit", (c) => reject(new Error("exit " + c)));
  });
}
async function enterAs(page, mode, roomCode) {
  await page.goto(`http://127.0.0.1:${PORT}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "pw");
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}
const server = await startServer();
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const codeOf = async (p) => (await p.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1];
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const a = await ctxA.newPage();
  const code = await enterAs(a, "create", "");
  // 双浏览器：独立 browser 加入
  const browser2 = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const b = await (await browser2.newContext({ viewport: { width: 1280, height: 960 } })).newPage();
  await enterAs(b, "join", code);
  await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
  await sleep(2000);
  const r = await a.evaluate(() => {
    const d = [];
    for (let i = 1; i < 300; i++) { const f = window.__prof0?.frames; break; }
    return new Promise((res) => {
      let last = performance.now(); let n = 0; const out = [];
      const tick = () => { const t = performance.now(); out.push(t - last); last = t; if (++n >= 300) res({ p50: out.sort((x, y) => x - y)[150].toFixed(1), vis: document.visibilityState }); else setTimeout(tick, 0); };
      setTimeout(tick, 0);
    });
  });
  console.log("双浏览器 started 主循环可用度(setTimeout0 p50):", JSON.stringify(r));
  const fps = await a.evaluate(() => ({ raw: window.__fw.loop.rawDelta, fps: +window.__fw.loop.actualFps.toFixed(1) }));
  console.log("双浏览器 game loop:", JSON.stringify(fps));
  await browser2.close();
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

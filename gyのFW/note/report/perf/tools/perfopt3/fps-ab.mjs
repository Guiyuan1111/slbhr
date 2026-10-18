import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3594;
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
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--enable-precise-memory-info"] });
const measure = (page) => page.evaluate(() => new Promise((res) => {
  const d = []; let last = performance.now(); let n = 0;
  const tick = () => { const t = performance.now(); d.push(t - last); last = t; if (++n >= 200) res({ p50: d.sort((a,b)=>a-b)[100].toFixed(1), renderer: window.__fw?.renderer?.type, vis: document.visibilityState }); else setTimeout(tick, 0); };
  setTimeout(tick, 0);
}));
try {
  // 单页（未开局）
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const a = await ctx1.newPage();
  await enterAs(a, "create", "");
  await sleep(1500);
  console.log("单页(lobby, Game 场景在跑):", JSON.stringify(await measure(a)));
  // 同 context 第二页
  const b = await ctx1.newPage();
  await enterAs(b, "join", (await a.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1]);
  await sleep(1500);
  console.log("同context双页 A:", JSON.stringify(await measure(a)), " renderer A:", a.evaluate(() => window.__fw.renderer.type));
  // 独立 context 双页
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const b2 = await ctx2.newPage();
  const code2 = await enterAs(a, "create", "");
  await enterAs(b2, "join", code2);
  await sleep(1500);
  console.log("跨context双页 A:", JSON.stringify(await measure(a)));
  // 双浏览器
  const browser2 = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const c = await (await browser2.newContext({ viewport: { width: 1280, height: 960 } })).newPage();
  const code3 = await enterAs(a, "create", "");
  await enterAs(c, "join", code3);
  await sleep(1500);
  console.log("双浏览器 A:", JSON.stringify(await measure(a)));
  await browser2.close();
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

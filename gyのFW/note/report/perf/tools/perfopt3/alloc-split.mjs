// 分配拆分：逐步 noop GameScene 子方法，看 alloc 降幅
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3600;
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
  const measure = () => a.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    let last = performance.memory.usedJSHeapSize, posSum = 0;
    const samp = setInterval(() => { const h = performance.memory.usedJSHeapSize; if (h > last) posSum += h - last; last = h; }, 40);
    setTimeout(() => { clearInterval(samp); res(+(posSum / 1024 / ((performance.now() - t0) / 1000)).toFixed(0)); }, 5000);
  }));
  const noop = (expr) => a.evaluate(expr);
  console.log("baseline alloc KB/s:", await measure());
  await noop(`(() => { const s = window.__fw.scene.getScene("Game"); const noopF = () => {}; const saved = {}; for (const m of ["updatePlayers","updateMechs","updateDiamonds","updatePlatformSound","updateNavies","updateTutorial"]) { saved[m] = s[m]; s[m] = noopF; } window.__saved = saved; return true; })()`);
  console.log("update 子方法全 noop KB/s:", await measure());
  await noop(`(() => { const s = window.__fw.scene.getScene("Game"); s.update = () => {}; return true; })()`);
  console.log("scene.update 全 noop KB/s:", await measure());
  await noop(`(() => { const s = window.__fw.scene.getScene("Game"); s.update = (t, d) => { const st = s.d.net.room.state; const cs = String(Math.floor((Number(st.timerMs)||0)/1000)); }; return true; })()`);
  console.log("仅留 state 读 KB/s:", await measure());
  // 恢复
  await noop(`(() => { const s = window.__fw.scene.getScene("Game"); Object.assign(s, window.__saved); s.update = GameScene.prototype.update; return true; })()`);
  console.log("恢复后 KB/s:", await measure());
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

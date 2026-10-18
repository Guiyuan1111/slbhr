// 分配归因探针：60Hz vs 20Hz patch（服务端 FW_PATCH_MS）+ setDepth/setPosition/setAngle 每帧计数
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer(port, patchMs) {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0", ...(patchMs ? { FW_PATCH_MS: String(patchMs) } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 60000);
    const ondata = (buf) => { const s = String(buf); if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("EADDRINUSE")); } else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); } };
    child.stdout.on("data", ondata); child.stderr.on("data", () => {}); child.on("exit", (c) => reject(new Error("exit " + c)));
  });
}
async function enterAs(page, port, mode, code) {
  await page.goto(`http://127.0.0.1:${port}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "pw");
  if (mode === "join") await page.fill("#roomcode", code);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}
const PROBE = `(() => {
  const C = window.__cnt = { setDepth: 0, setPosition: 0, setAngle: 0, setRotation: 0, frames: 0, setText: 0, forEachCalls: 0 };
  const GO = window.Phaser ? Phaser.GameObjects : null;
  // GameObject prototype 上包 Transform/Origin/Depth 组件 setter（Image/Sprite/Container 共享 mixins）
  for (const cls of ["Image", "Sprite", "Container", "TileSprite", "BitmapText"]) {
    const p = Phaser.GameObjects[cls]?.prototype;
    if (!p) continue;
    for (const m of ["setDepth", "setAngle", "setRotation"]) {
      if (typeof p[m] !== "function") continue;
      const orig = p[m];
      p[m] = function (...a) { C[m]++; return orig.apply(this, a); };
    }
  }
  const g = window.__fw;
  g.events.on("postrender", () => C.frames++);
  return true;
})()`;
async function runOnce(patchMs) {
  const PORT = patchMs === 50 ? 3598 : 3599;
  const server = await startServer(PORT, patchMs);
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
    const code = await enterAs(a, PORT, "create", "");
    await enterAs(b, PORT, "join", code);
    await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
    await sleep(2000);
    await a.evaluate(PROBE);
    const r = await a.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const h0 = performance.memory.usedJSHeapSize;
      let posSum = 0;
      let last = h0;
      const samp = setInterval(() => { const h = performance.memory.usedJSHeapSize; if (h > last) posSum += h - last; last = h; }, 50);
      setTimeout(() => {
        clearInterval(samp);
        const C = window.__cnt;
        res({ secs: +((performance.now() - t0) / 1000).toFixed(1), allocKBs: +(posSum / 1024 / ((performance.now() - t0) / 1000)).toFixed(0), ...C });
      }, 8000);
    }));
    console.log(`patch=${patchMs === 50 ? "20Hz" : "60Hz"}:`, JSON.stringify(r), `→ setDepth/帧=${(r.setDepth / r.frames).toFixed(1)} setAngle/帧=${(r.setAngle / r.frames).toFixed(1)} setRotation/帧=${(r.setRotation / r.frames).toFixed(1)}`);
  } finally {
    await browser.close().catch(() => {});
    try { server.kill(); } catch {}
    await sleep(400); try { server.kill("SIGKILL"); } catch {}
  }
}
await runOnce(undefined); // 60Hz
await runOnce(50); // 20Hz

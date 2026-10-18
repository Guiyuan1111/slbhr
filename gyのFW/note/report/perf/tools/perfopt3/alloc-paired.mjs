// 交错配对 A/B：消除时序漂移
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3606;
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
  await sleep(2500);
  const measure = () => a.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    let last = performance.memory.usedJSHeapSize, posSum = 0;
    const samp = setInterval(() => { const h = performance.memory.usedJSHeapSize; if (h > last) posSum += h - last; last = h; }, 30);
    setTimeout(() => { clearInterval(samp); res(+(posSum / 1024 / ((performance.now() - t0) / 1000)).toFixed(0)); }, 3500);
  }));
  const noopUpdate = (v) => a.evaluate((on) => {
    const s = window.__fw.scene.getScene("Game");
    if (on) { window.__realUpdate = s.update; s.update = () => {}; }
    else if (window.__realUpdate) { s.update = window.__realUpdate; }
    return true;
  }, v);
  const noopTweensAnims = (v) => a.evaluate((on) => {
    const g = window.__fw;
    const s = g.scene.getScene("Game");
    if (on) {
      s.tweens.pauseAll();
      // 液体/风/角色动画仍走全局 AnimationManager→AnimationState；直接停全部 Sprite 动画状态
      for (const c of s.children.list) { if (c.anims) { window.__animsPaused = window.__animsPaused || []; window.__animsPaused.push([c, c.anims.isPlaying]); c.anims.stop(); } }
    } else {
      s.tweens.resumeAll();
    }
    return true;
  }, v);
  const pairs = [];
  for (let i = 0; i < 3; i++) {
    noopUpdate(false);
    const full = await measure();
    noopUpdate(true);
    const noUpd = await measure();
    pairs.push([full, noUpd]);
    noopUpdate(false);
  }
  const fullAvg = pairs.map((p) => p[0]).reduce((x, y) => x + y) / 3;
  const noUpdAvg = pairs.map((p) => p[1]).reduce((x, y) => x + y) / 3;
  console.log("配对(全速, update-noop):", JSON.stringify(pairs));
  console.log(`update 路径份额（配对均值）: ${fullAvg.toFixed(0)} - ${noUpdAvg.toFixed(0)} = ${(fullAvg - noUpdAvg).toFixed(0)} KB/s`);
  // sys.step（场景事件/tween/anim 机器）停 vs 渲染停（各 3 配对）
  const noopSysStep = (v) => a.evaluate((on) => {
    const s = window.__fw.scene.getScene("Game");
    if (on) { window.__realStep = s.sys.step; s.sys.step = () => {}; }
    else if (window.__realStep) { s.sys.step = window.__realStep; }
    return true;
  }, v);
  const noopRender = (v) => a.evaluate((on) => {
    const g = window.__fw;
    if (on) { window.__realSceneRender = g.scene.render; g.scene.render = () => {}; }
    else if (window.__realSceneRender) { g.scene.render = window.__realSceneRender; }
    return true;
  }, v);
  const pairs2 = [];
  for (let i = 0; i < 3; i++) {
    noopSysStep(false);
    const f = await measure();
    noopSysStep(true);
    const n = await measure();
    pairs2.push([f, n]);
    noopSysStep(false);
  }
  console.log("sys.step 配对:", JSON.stringify(pairs2), `份额=${(pairs2.map(p => p[0] - p[1]).reduce((x, y) => x + y) / 3).toFixed(0)}KB/s`);
  const pairs3 = [];
  for (let i = 0; i < 3; i++) {
    noopRender(false);
    const f = await measure();
    noopRender(true);
    const n = await measure();
    pairs3.push([f, n]);
    noopRender(false);
  }
  console.log("渲染 配对:", JSON.stringify(pairs3), `份额=${(pairs3.map(p => p[0] - p[1]).reduce((x, y) => x + y) / 3).toFixed(0)}KB/s`);
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

// Canvas 渲染器版本剖析（stub WebGL → Phaser.AUTO 落 CANVAS）
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3596;
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
const HOOK = `(() => {
  const g = window.__fw;
  const P = window.__prof = { frames: [], mechCalls: 0 };
  const scene = g.scene.getScene("Game");
  const origMT = scene.mechTarget.bind(scene);
  scene.mechTarget = (...a) => { P.mechCalls++; return origMT(...a); };
  let f = null;
  g.events.on("prestep", (time) => { f = { t: time, raw: g.loop.rawDelta, fps: g.loop.actualFps, _t0: performance.now() }; if (performance.memory) f.heap = performance.memory.usedJSHeapSize; });
  g.events.on("poststep", () => { if (f) f._t1 = performance.now(); });
  g.events.on("postrender", () => { if (!f) return; f.update = f._t1 - f._t0; f.total = performance.now() - f._t0; P.frames.push(f); f = null; });
  return { renderer: g.renderer.type === 2 ? "webgl" : "canvas", children: scene.children.length };
})()`;
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
  console.log("hook:", JSON.stringify(await a.evaluate(HOOK)));
  await sleep(8000);
  const prof = await a.evaluate(() => {
    const P = window.__prof;
    let posSum = 0, gcDrops = [];
    for (let i = 1; i < P.frames.length; i++) {
      const d = (P.frames[i].heap ?? 0) - (P.frames[i - 1].heap ?? 0);
      if (d > 0) posSum += d; else if (d < -200 * 1024) gcDrops.push(+(-d / 1024).toFixed(0));
    }
    return { frames: P.frames, mechCalls: P.mechCalls, heap: { allocKB: +(posSum / 1024).toFixed(1), gcDrops }, dyn: { renderer: window.__fw.renderer.type, fpsNow: window.__fw.loop.actualFps, mechSm: window.__fw.scene.getScene("Game").mechSm.size } };
  });
  const fr = prof.frames;
  const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]; };
  const sum = fr.reduce((x, y) => x + y.total, 0);
  const dt = (fr[fr.length - 1].t - fr[0].t) / 1000;
  console.log(`Canvas 模式: frames=${fr.length} ${dt.toFixed(1)}s 有效fps=${(fr.length / dt).toFixed(1)} loopFps=${prof.dyn.fpsNow.toFixed(1)}`);
  console.log(`帧总 p50=${q(fr.map(f => f.total), .5).toFixed(2)} p95=${q(fr.map(f => f.total), .95).toFixed(2)} p99=${q(fr.map(f => f.total), .99).toFixed(2)} avg=${(sum / fr.length).toFixed(2)}ms`);
  console.log(`update段 p50=${q(fr.map(f => f.update), .5).toFixed(2)} p95=${q(fr.map(f => f.update), .95).toFixed(2)} avg=${(fr.reduce((x, y) => x + y.update, 0) / fr.length).toFixed(2)}ms`);
  console.log(`raw p50=${q(fr.map(f => f.raw), .5).toFixed(1)} 分配≈${(prof.heap.allocKB / dt).toFixed(0)}KB/s gcDrops=${prof.heap.gcDrops.length} mechCalls=${(prof.mechCalls / dt).toFixed(0)}/s`);
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

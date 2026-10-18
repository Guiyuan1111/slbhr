// 显示列表分族隐藏 → churn 差分（找渲染侧分配大户）
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3605;
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
    const samp = setInterval(() => { const h = performance.memory.usedJSHeapSize; if (h > last) posSum += h - last; last = h; }, 40);
    setTimeout(() => { clearInterval(samp); res(+(posSum / 1024 / ((performance.now() - t0) / 1000)).toFixed(0)); }, 4000);
  }));
  const setVis = (sel, vis) => a.evaluate(([s, v]) => {
    const scene = window.__fw.scene.getScene("Game");
    const targets = [];
    for (const c of scene.children.list) {
      if (s === "depth2" && (c.depth === 2 || c.depth === 0)) targets.push(c);
      if (s === "deco" && c.depth === 6) targets.push(c);
      if (s === "liquid" && c.depth === 7) targets.push(c);
      if (s === "chars" && (c.depth >= 4 && c.depth < 6)) targets.push(c);
      if (s === "navy" && c.depth === 3.5) targets.push(c);
      if (s === "mech" && (c.depth >= 1 && c.depth < 2)) targets.push(c);
      if (s === "all") targets.push(c);
    }
    let n = 0;
    for (const t of targets) { t.setVisible(v); n++; }
    return n;
  }, [sel, vis]);
  const base = await measure();
  const groups = [["depth2", "背景+地面"], ["mech", "underGround 机关(1.x)"], ["deco", "装饰(6)"], ["liquid", "液体(7)"], ["chars", "角色(4-5.5)"], ["navy", "navies(3.5)"]];
  const counts = {};
  for (const [g, name] of groups) counts[g] = await setVis(g, false);
  const allHidden = await measure();
  console.log(`base=${base} 全隐藏=${allHidden}（隐藏 ${JSON.stringify(counts)}）`);
  for (const [g, name] of groups) {
    await setVis(g, true);
    const v = await measure();
    console.log(`  恢复 ${name}(${g} ×${counts[g]}): ${v} KB/s（增量 ${v - allHidden}）`);
    await setVis(g, false);
  }
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400); try { server.kill("SIGKILL"); } catch {}
}

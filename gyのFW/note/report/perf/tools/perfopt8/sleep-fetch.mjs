// 决定性：loop.sleep() 对页内 fetch POST /matchmake 的影响（不点击、不动产品逻辑）
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const PORT = 3562, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res) => { const t = setTimeout(res, 60000); const on = (b) => { if (String(b).includes("http+ws")) { clearTimeout(t); res(); } };
  server.stdout.on("data", on); server.stderr.on("data", () => {}); });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000 });
await page.waitForFunction(() => globalThis.__fw?.textures?.exists("ground"), null, { timeout: 30000 });
const probe = async (label) => {
  const xs = [];
  for (let i = 0; i < 6; i++) {
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      const r = await fetch("/matchmake/forest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ levelId: "forest_01", password: "x" }) });
      await r.arrayBuffer();
      return performance.now() - t0;
    });
    xs.push(+ms.toFixed(1));
  }
  xs.sort((a, b) => a - b);
  console.log(`${label}: ${xs.join(" / ")}  中位=${xs[3]}`);
};
await probe("awake(画布动画中)");
await page.evaluate(() => globalThis.__fw.loop.sleep());
await new Promise((r) => setTimeout(r, 300));
await probe("asleep(画布冻结中)");
await browser.close(); server.kill("SIGTERM");

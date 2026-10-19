// 隔离：全新服务器 × 单次建房，浏览器内 POST /matchmake 资源时序
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const PORT = 3562, BASE = `http://127.0.0.1:${PORT}`;
async function freshServer() {
  const s = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("x")), 60000);
    const on = (b) => { if (String(b).includes("http+ws")) { clearTimeout(t); res(); } };
    s.stdout.on("data", on); s.stderr.on("data", () => {}); });
  return s;
}
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const INIT = () => {
  const res = (globalThis.__fwRes = []);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) res.push({ url: e.name, start: e.startTime, end: e.responseEnd, dns: e.domainLookupEnd - e.domainLookupStart, tcp: e.connectEnd - e.connectStart, ttfb: e.responseStart - e.requestStart, wait: e.requestStart - e.startTime }); }).observe({ type: "resource", buffered: true });
};
for (let round = 1; round <= 4; round++) {
  const server = await freshServer();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000 });
  await page.fill("#password", "x");
  await page.waitForFunction(() => {
    const g = globalThis.__fw; const r = globalThis.__fwRes ?? [];
    return g?.textures?.exists("ground") && performance.now() - (r.at(-1)?.end ?? 0) > 300;
  }, null, { timeout: 30000, polling: 50 });
  await page.click("#btn-create");
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Game"), null, { timeout: 30000, polling: 5 });
  const mm = (await page.evaluate(() => globalThis.__fwRes)).filter((r) => r.url.includes("/matchmake")).at(-1);
  console.log(`round${round}: POST 总=${(mm.end - mm.start).toFixed(1)}ms (queue=${mm.wait?.toFixed(1)} dns=${mm.dns?.toFixed(1)} tcp=${mm.tcp?.toFixed(1)} ttfb=${mm.ttfb?.toFixed(1)})`);
  await ctx.close(); server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
}
await browser.close();

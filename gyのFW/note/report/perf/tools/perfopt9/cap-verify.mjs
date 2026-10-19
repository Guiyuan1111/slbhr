import { spawn } from "node:child_process";
import { chromium } from "playwright";
const PORT = 3564, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res) => { const t = setTimeout(res, 60000); const on = (b) => { if (String(b).includes("http+ws")) { clearTimeout(t); res(); } };
  server.stdout.on("data", on); server.stderr.on("data", () => {}); });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const a = await ctx.newPage();
await a.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
const HOOK = `(async () => {
  const g = globalThis.__fw;
  let n = 0; const onPost = () => n++;
  g.events.on("postrender", onPost);
  await new Promise((r) => setTimeout(r, 4000));
  g.events.off("postrender", onPost);
  return n;
})()`;
console.log("menu 4s 渲染帧数:", await a.evaluate(HOOK));
await a.evaluate(() => globalThis.__fw?.scene?.getScene("Menu")?.scene?.start("Temple"));
await a.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 30000, polling: 20 });
console.log("temple 4s 渲染帧数:", await a.evaluate(HOOK));
await browser.close(); server.kill("SIGTERM");

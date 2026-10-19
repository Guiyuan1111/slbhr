import { spawn } from "node:child_process";
import { chromium } from "playwright";
const PORT = 3562, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("x")), 60000);
  const on = (b) => { if (String(b).includes("http+ws")) { clearTimeout(t); res(); } };
  server.stdout.on("data", on); server.stderr.on("data", () => {}); });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await ctx.newPage();
const reqs = [];
page.on("request", (r) => reqs.push({ t: Date.now(), url: r.url().split("/").pop() }));
await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000 });
await page.waitForTimeout(2500);
const warm = reqs.filter((r) => /GroundAssets|MechAssets|TempleAssets|PopupAssets|\.mp3$|LevelMusic/.test(r.url));
console.log("总请求数=", reqs.length, " 暖装类请求=", warm.length);
console.log("暖装尾部:", warm.slice(-6).map((w) => w.url).join(", "));
await browser.close(); server.kill("SIGTERM");

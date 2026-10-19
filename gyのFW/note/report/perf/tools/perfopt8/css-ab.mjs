// r8 归因实验：对照三种 CSS 形态的 click→Game 分段（blur on/off、floaty on/off）
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const PORT = 3562, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("server超时")), 60000);
  const on = (b) => { const s = String(b); if (s.includes("http+ws")) { clearTimeout(t); res(); } };
  server.stdout.on("data", on); server.stderr.on("data", () => {});
});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling"] });

const INIT_HOOK = () => {
  const install = () => {
    const M = (globalThis.__fwM = []);
    const now = () => performance.now();
    const mode = globalThis.__cssMode;
    if (mode !== "baseline") {
      const st = document.createElement("style");
      if (mode === "noblur") st.textContent = "#menu{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
      if (mode === "nofloaty") st.textContent = ".menu-logo{animation:none!important}";
      if (mode === "both") st.textContent = "#menu{backdrop-filter:none!important}.menu-logo{animation:none!important}";
      document.head.appendChild(st);
    }
    const menu = document.getElementById("menu");
    new MutationObserver(() => {
      if (menu.classList.contains("hidden") && !M.some((m) => m.name === "menuHidden")) M.push({ name: "menuHidden", t: now() });
    }).observe(menu, { attributes: true, attributeFilter: ["class"] });
    const poll = () => {
      const g = globalThis.__fw;
      if (g && g.scene && g.scene.isActive("Game") && !globalThis.__s) { globalThis.__s = true; M.push({ name: "gameActive", t: now() }); }
      if (!g || !g.scene || !g.scene.isActive("Game")) globalThis.__s = false;
    };
    setInterval(poll, 2);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
};

async function once(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctx.addInitScript((m) => { globalThis.__cssMode = m; }, mode);
  await ctx.addInitScript(INIT_HOOK);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const g = globalThis.__fw; return g && g.scene && g.scene.isActive("Menu"); }, null, { timeout: 30000, polling: 20 });
  await page.fill("#password", "x");
  await page.waitForFunction(() => {
    const r = globalThis.__fwRes ?? [];
    const last = r.length ? r[r.length - 1].end : 0;
    return performance.now() - last > 300;
  }, null, { timeout: 30000, polling: 50 }).catch(() => {}); // fwRes 未定义时跳过等待（该变体没装 observer）
  const t0 = await page.evaluate(() => { globalThis.__fwM.push({ name: "click", t: performance.now() }); return performance.now(); });
  await page.click("#btn-create");
  await page.waitForFunction(() => { const g = globalThis.__fw; return g && g.scene && g.scene.isActive("Game"); }, null, { timeout: 30000, polling: 5 });
  await page.waitForTimeout(20);
  const marks = await page.evaluate(() => globalThis.__fwM);
  await ctx.close();
  const at = (n) => marks.find((m) => m.name === n)?.t;
  return +(at("gameActive") - t0).toFixed(1);
}

for (const mode of ["baseline", "noblur", "nofloaty", "both"]) {
  const xs = [];
  for (let i = 0; i < 3; i++) xs.push(await once(mode));
  xs.sort((a, b) => a - b);
  console.log(`${mode.padEnd(9)} 3轮: ${xs.join(" / ")}  中位=${xs[1]}`);
}
await browser.close();
server.kill("SIGTERM");

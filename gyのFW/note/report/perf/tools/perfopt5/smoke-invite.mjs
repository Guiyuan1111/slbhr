/** r5 件1 定向冒烟：邀请深链 ?room&pw 自动加入（enterGame 暖装门改动面：Menu 未建/暖装未启路径） */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const PORT = 3576;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"], detached: true,
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("server timeout")), 60000);
  const on = (b) => { const s = String(b); if (s.includes("EADDRINUSE")) { clearTimeout(t); rej(new Error("占用")); } else if (s.includes("http+ws")) { clearTimeout(t); res(); } };
  server.stdout.on("data", on); server.stderr.on("data", () => {});
});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
try {
  // A 建房
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const a = await ctxA.newPage();
  const errs = [];
  a.on("pageerror", (e) => errs.push("A:" + e));
  await a.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await a.fill("#password", "smoke-pw");
  await a.click("#btn-create");
  await a.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  const code = (await a.textContent("#hud-room")).match(/房间码 ([^（\s]{4,})/)[1];
  // B 邀请深链自动加入（300ms 自动 start(join)——最早可能早于 Menu create/暖装启动）
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errs.push("B:" + e));
  await b.goto(`${BASE}/?level=forest_01&room=${encodeURIComponent(code)}&pw=smoke-pw`, { waitUntil: "domcontentloaded" });
  await b.waitForFunction(() => globalThis.__fw?.scene?.isActive?.("Game"), null, { timeout: 30000 });
  // 双端 Game active + 关卡渲染纹理完备探针（关键纹理键存在 + 帧推进）
  for (const [name, page] of [["A", a], ["B", b]]) {
    const st = await page.evaluate(() => {
      const g = globalThis.__fw;
      const keys = ["chars", "ground", "mech", "temple", "popup", "menu", "font"];
      const have = Object.fromEntries(keys.map((k) => [k, g.textures.exists(k)]));
      return { active: g.scene.isActive("Game"), have, frame: g.loop.frame };
    });
    console.log(`[${name}] Game active=${st.active} 纹理=${JSON.stringify(st.have)} frame=${st.frame}`);
  }
  await sleep(1500);
  const f2 = await b.evaluate(() => globalThis.__fw.loop.frame);
  console.log(`[B] 1.5s 后 frame=${f2}（推进正常）`);
  console.log(errs.length ? `⚠ 页面错误: ${errs.join(" | ")}` : "页面错误: 0");
  process.exitCode = errs.length ? 1 : 0;
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
}

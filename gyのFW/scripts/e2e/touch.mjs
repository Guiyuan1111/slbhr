/**
 * M2 触屏虚拟按键 e2e（自动化：Playwright 触摸仿真，真机验收另见 handoff [人工] 项）。
 *
 * 验证点：
 * 1. iPhone 描述符（hasTouch + coarse pointer）：进房后 started 阶段三键可见；
 * 2. 真实触摸路径：touchscreen.tap 跳跃键 → 角色 y 明显上抬；
 * 3. 按住路径：pointer 按住右键 1.5s → 角色 x 右移 >100px（服务端权威位移）;
 * 4. 桌面 context：按钮不存在（仅粗指针/?touch=1 创建）；
 * 5. 全程零页面错误。
 *
 * 用法：node scripts/e2e/touch.mjs [--port 3558]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 3558);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "touch-pw";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[touch-e2e]", ...a);

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (b) => {
      const s = String(b);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

const playerPos = (page, role) => page.evaluate((r) => {
  const scene = globalThis.__fw.scene.getScene("Game");
  const v = scene.views.get(r);
  return { x: v.legs.x, y: v.legs.y };
}, role);

const server = await startServer();
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? "（" + detail + "）" : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio"] });
try {
  // ---------- A. iPhone 触摸设备（创建者 = 火人） ----------
  const iphone = await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN" });
  const t = await iphone.newPage();
  const errs = [];
  t.on("pageerror", (e) => errs.push(String(e)));
  await t.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await t.fill("#password", PASSWORD);
  await t.click("#btn-create");
  await t.waitForSelector("#menu", { state: "hidden", timeout: 20000 });
  await t.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  const code = ((await t.textContent("#hud-room")).match(/房间码 ([^（\s]+)/) || [])[1];
  await t.waitForFunction(() => globalThis.__fw?.scene?.isActive?.("Game"), null, { timeout: 60000 });
  log(`触摸端入房 ${code}（Game active，等待 started）`);

  // ---------- B. 桌面端加入（水女孩） ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const d = await desktop.newPage();
  d.on("pageerror", (e) => errs.push(String(e)));
  await d.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await d.fill("#password", PASSWORD);
  await d.fill("#roomcode", code);
  await d.click("#btn-join");
  await t.waitForFunction(() => document.querySelector("#hud-status")?.textContent === "", null, { timeout: 30000 });
  await t.waitForTimeout(600); // ready 2s 倒计时 + 快照收敛

  // 1) started 阶段按钮可见（ready 起就应可见）
  const visible = await t.evaluate(() => {
    const root = document.querySelector("#touch-controls");
    if (!root) return { exists: false };
    const btns = [...root.querySelectorAll(".touch-btn")];
    const r = root.getBoundingClientRect();
    return { exists: true, hidden: root.classList.contains("hidden"), n: btns.length, inViewport: btns.map((b) => b.getBoundingClientRect()).every((x) => x.width > 0 && x.height > 0), w: r.width };
  });
  check("触摸端三键可见", visible.exists && !visible.hidden && visible.n === 3 && visible.inViewport, `n=${visible.n}`);

  // 2) 真实触摸 tap 跳跃 → y 上抬
  const before = await playerPos(t, "fireboy");
  const jumpBtn = await t.$(".touch-btn.jump");
  const jb = await jumpBtn.boundingBox();
  await t.touchscreen.tap(jb.x + jb.width / 2, jb.y + jb.height / 2);
  let minY = before.y;
  for (let i = 0; i < 20; i++) { await sleep(50); const p = await playerPos(t, "fireboy"); minY = Math.min(minY, p.y); }
  check("tap 跳跃 → y 上抬 >30px", before.y - minY > 30, `Δy=${(before.y - minY).toFixed(1)}px`);

  // 3) 按住右键 1.5s → x 右移（真实 pointer 序列：down → 悬停 → up）
  const p0 = await playerPos(t, "fireboy");
  const rightBtn = await t.$(".touch-btn.right");
  const rb = await rightBtn.boundingBox();
  await t.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await t.mouse.down();
  await sleep(1500);
  const p1 = await playerPos(t, "fireboy");
  await t.mouse.up();
  const onClass = await t.evaluate(() => document.querySelector(".touch-btn.right")?.classList.contains("on") ?? false);
  check("按住右键 1.5s → x 右移 >100px", p1.x - p0.x > 100, `Δx=${(p1.x - p0.x).toFixed(1)}px`);
  check("抬起后高亮消除", !onClass);

  // 4) 桌面端无按钮
  const dt = await desktop.newPage();
  await dt.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const desktopHas = await dt.evaluate(() => !!document.querySelector("#touch-controls .touch-btn"));
  check("桌面端不创建按钮", !desktopHas);

  // 5) 零页面错误
  check("零页面错误", errs.length === 0, errs.join("; "));
  await iphone.close();
  await desktop.close();
} catch (err) {
  failures++;
  console.error("FATAL:", err);
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400);
  try { server.kill("SIGKILL"); } catch {}
}

console.log(failures === 0 ? "TOUCH E2E PASS" : `TOUCH E2E FAIL（${failures} 项）`);
process.exit(failures === 0 ? 0 : 1);

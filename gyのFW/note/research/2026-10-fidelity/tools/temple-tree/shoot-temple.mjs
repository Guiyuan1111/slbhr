/**
 * TEMP/uitree/shoot-temple.mjs — 选关树"枝"修复视觉冒烟（21 号档卷配套取证脚本）。
 * 流程：起服（服务 dist）→ 种 1 星进度（forest_01）→ 隐藏 DOM 联机面板 → 真实点击
 * Menu「开始游戏」区（画布 640,513）进 Temple → 等装载 → 截 canvas 原生 PNG。
 * 断言在 analyze_temple.py 做像素级判据（金线/暗枝/底座）。
 * 用法：node TEMP/uitree/shoot-temple.mjs [port]
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/home/gy/桌面/dev/slbhr/gyのFW/node_modules/playwright/index.mjs";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
const PORT = Number(process.argv[2] || 3589);
const { startServer } = await import(join(ROOT, "scripts", "e2e", "lib.mjs"));

mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

await page.addInitScript(
  `localStorage.setItem("fw-temple-progress-v1", JSON.stringify({ "tutorials/levels/forest_01.json": { stars: 1, time: 39 } }));`
);

await page.goto(`http://127.0.0.1:${PORT}/?level=forest_01`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200); // Phaser Menu 起来
await page.evaluate(() => {
  const m = document.querySelector("#menu");
  if (m) m.style.display = "none"; // 与"加入后隐藏"同观感，让画布可点
});
await page.waitForTimeout(400);

const box = await page.locator("canvas").first().boundingBox();
console.log("canvas box:", JSON.stringify(box));
const sx = box.width / 1280, sy = box.height / 960;
// Menu「开始游戏」交互区：世界 (640,513) 300×100（MenuScene create）
await page.mouse.click(box.x + 640 * sx, box.y + 513 * sy);
await page.waitForTimeout(3000); // Temple preload（temple.json + 图集）+ create

await page.locator("canvas").first().screenshot({ path: join(OUT, "temple-after-fix.png") });
console.log("pageerrors:", JSON.stringify(errs));
await browser.close();
server.kill ? server.kill() : process.kill(server.pid, "SIGTERM");
console.log("DONE ->", join(OUT, "temple-after-fix.png"));

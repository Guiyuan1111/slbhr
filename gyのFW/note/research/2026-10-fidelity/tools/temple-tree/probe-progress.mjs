/** TEMP/uitree/probe-progress.mjs — 探针：localStorage 种子是否生效 + Temple 内星帧状态 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/home/gy/桌面/dev/slbhr/gyのFW/node_modules/playwright/index.mjs";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const PORT = Number(process.argv[2] || 3589);
const { startServer } = await import(join(ROOT, "scripts", "e2e", "lib.mjs"));
const server = await startServer(PORT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.addInitScript(
  `localStorage.setItem("fw-temple-progress-v1", JSON.stringify({ "tutorials/levels/forest_01.json": { stars: 1, time: 39 } }));`
);
await page.goto(`http://127.0.0.1:${PORT}/?level=forest_01`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
console.log("ls after load:", await page.evaluate(() => localStorage.getItem("fw-temple-progress-v1")));
await page.evaluate(() => { const m = document.querySelector("#menu"); if (m) m.style.display = "none"; });
await page.waitForTimeout(300);
const box = await page.locator("canvas").first().boundingBox();
const sx = box.width / 1280, sy = box.height / 960;
await page.mouse.click(box.x + 640 * sx, box.y + 513 * sy);
await page.waitForTimeout(3000);
console.log("ls in temple:", await page.evaluate(() => localStorage.getItem("fw-temple-progress-v1")));
// 1-2 线段沿途采样（视口系→canvas 系），打印 5 个点的实际像素色
const pts = [];
for (let t = 0.25; t <= 0.75; t += 0.125) {
  const vx = 640 + (552.24 - 640) * t, vy = 825.6 + (739.2 - 825.6) * t;
  pts.push([vx * sx, vy * sy]);
}
const colors = await page.evaluate((pts) => {
  const cv = document.querySelector("canvas");
  const g = cv.getContext("webgl2") || cv.getContext("webgl");
  // WebGL canvas 不可 2d 采样——改走 toDataURL 由外部解
  return null;
}, pts);
const shot = join(dirname(fileURLToPath(import.meta.url)), "shots", "probe.png");
await page.locator("canvas").first().screenshot({ path: shot });
console.log("shot:", shot);
await browser.close();
try { process.kill(server.pid, "SIGTERM"); } catch {}
console.log("PROBE DONE");

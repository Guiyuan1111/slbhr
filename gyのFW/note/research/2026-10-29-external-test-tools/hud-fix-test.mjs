#!/usr/bin/env node
/**
 * HUD 窄屏回归：确认 #hud-top 在各视口下都不溢出视口（修复前后对照用）。
 * 可跑本地 dist（--base http://127.0.0.1:PORT）或外网部署。
 */
import { chromium, devices } from "playwright";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", "http://127.0.0.1:2567");
const CASES = [
  { name: "320x568 极窄", opts: { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true } },
  { name: "390x664 iPhone12 竖屏", opts: { ...devices["iPhone 12"] } },
  { name: "414x896 大屏手机竖", opts: { viewport: { width: 414, height: 896 }, hasTouch: true, isMobile: true } },
  { name: "844x390 手机横屏", opts: { ...devices["iPhone 12"], viewport: { width: 844, height: 390 } } },
  { name: "810x1080 平板", opts: { ...devices["iPad (gen 7)"] } },
  { name: "1280x960 桌面", opts: { viewport: { width: 1280, height: 960 } } },
];

const fails = [];
const browser = await chromium.launch();
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ ...c.opts });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
      await page.fill("#password", "hudfix");
      await page.click("#btn-create");
      await page.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
      await page.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 45000 });
      await page.waitForTimeout(900);

      const m = await page.evaluate(() => {
        const top = document.querySelector("#hud-top");
        const r = top.getBoundingClientRect();
        const roomText = document.querySelector("#hud-room")?.textContent ?? "";
        const invite = document.querySelector("#btn-invite");
        const ir = invite?.getBoundingClientRect();
        return {
          vw: innerWidth,
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
          overflowLeft: r.left < -0.5, overflowRight: r.right > innerWidth + 0.5,
          roomVisible: /房间码/.test(roomText),
          inviteInView: ir ? ir.left >= 0 && ir.right <= innerWidth + 0.5 : null,
          docOverflowX: document.documentElement.scrollWidth > innerWidth + 2,
        };
      });
      const pass = !m.overflowLeft && !m.overflowRight && !m.docOverflowX && m.roomVisible;
      console.log(`${pass ? "PASS" : "FAIL"}  ${c.name}  hud ${m.left}..${m.right}/${m.vw} 房间码=${m.roomVisible} 邀请钮在视内=${m.inviteInView}`);
      if (!pass) fails.push(c.name);
    } catch (e) {
      console.log(`FAIL  ${c.name}  ${String(e).slice(0, 120)}`);
      fails.push(c.name);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== HUD 全视口不溢出 ===");
process.exit(fails.length ? 1 : 0);

#!/usr/bin/env node
/**
 * browser-room：浏览器真实建房链路冒烟（2026-10-28 P0 回归门禁）。
 *
 * 由来：seedrandom 的 new Function 加载被 CSP（0.3.51 #45）禁 eval 拦截后，浏览器
 * 建房→Game 全断，而 node 侧 e2e（route-node/servers-smoke）不加载浏览器 bundle、
 * audiofamily 不建房——P0 断链潜伏 0.3.51–0.3.55 五个版本无人察觉。本门禁补上
 * 「浏览器建房 → Game create 完成 → 离房回选关」的完整链路：pageerror 必须为零
 * （new Function 类回归会当场炸 create，Game 永停 CREATING），groundTex 就位/释放
 * 钉住 r13 地面缓存两个集成点。
 *
 * 用法（需已构建 dist + 运行中的服务端）：
 *   node scripts/e2e/browser-room.mjs [--base http://127.0.0.1:3700]
 * 判据：Game active ≤20s、groundTex 1312×992 在场、离房后 Temple active 且
 * groundTex 已摘、全程 pageerror=0。任一不满足退出码 1。
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : (process.env.FW_PLAY_BASE ?? "http://127.0.0.1:3700");

const browser = await chromium.launch();
let failed = 0;
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!globalThis.__fw, null, { timeout: 30000 });
  await page.waitForFunction(() => globalThis.__fw.scene.isActive("Menu"), null, { timeout: 30000 });
  await page.fill("#password", "smoke1");
  await page.click("#btn-create");
  await page.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 30000 });
  // 建房转场（XFade fade-in 500ms）完成→ops 起场景；Game active 即 create 完成
  await page.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 20000 });
  // XFade fade-out 尚在跑（Game active 早于转场收尾）——等转场收尾再操作，防防重入门丢弃
  await page.waitForFunction(
    () => {
      const x = globalThis.__fw.scene.getScenes(false).find((s) => s.scene.key === "XFade");
      return !x || x.sys.settings.status === 8;
    },
    null,
    { timeout: 10000 },
  );
  const inGame = await page.evaluate(() => {
    const src = globalThis.__fwInit.game.textures.get("groundTex")?.getSourceImage?.();
    return { groundTex: !!src, w: src?.width ?? 0, h: src?.height ?? 0 };
  });
  // 离房回选关：r13 释放（groundTex 摘除）+ Temple active
  await page.evaluate(() => globalThis.__fwLeaveToMenu());
  await page.waitForFunction(() => globalThis.__fw.scene.isActive("Temple"), null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const afterLeave = await page.evaluate(() => ({
    groundTexReleased: !globalThis.__fwInit.game.textures.exists("groundTex"),
    gameStopped: !globalThis.__fw.scene.isActive("Game"),
  }));

  const checks = [
    [inGame.groundTex && inGame.w === 1312 && inGame.h === 992, `groundTex 在场 ${JSON.stringify(inGame)}`],
    [afterLeave.groundTexReleased, "离房 groundTex 已释放"],
    [afterLeave.gameStopped, "离房 Game 已停"],
    [pageErrors.length === 0, `pageerror=0${pageErrors.length ? ` 实际=${JSON.stringify(pageErrors.map((e) => e.slice(0, 120)))}` : ""}`],
  ];
  for (const [ok, label] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed++;
  }
  await page.close();
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

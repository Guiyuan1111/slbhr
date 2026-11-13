#!/usr/bin/env node
/**
 * 外网真浏览器测试：打开部署在服务器上的游戏，走完 Menu → 建房 → Game，
 * 断言零 pageerror、零 console.error、关键资源全部 200、Game 场景真的 active。
 *
 * 用法：
 *   node TEMP/browser-test.mjs [--base http://110.42.36.114:2567] [--level forest_01]
 *                              [--shot TEMP/shot.png]
 *
 * 只做客户端行为，不碰服务器文件。
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://110.42.36.114:2567");
const LEVEL = argOf("level", "forest_01");
const SHOT = argOf("shot", "");

const fails = [];
const ok = (c, label, detail = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!c) fails.push(label);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const pageErrors = [];
  const consoleErrors = [];
  const failedReqs = [];
  const badStatus = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => failedReqs.push(`${r.url().slice(-70)} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) badStatus.push(`${r.status()} ${r.url().slice(-70)}`); });

  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!globalThis.__fw, null, { timeout: 60000 });
  ok(true, "① 页面加载 + 游戏实例就绪");

  await page.waitForFunction(() => globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  ok(true, "② Menu 场景 active");

  // 资源面：主 JS / phaser / colyseus / 音频 / 图集
  const res = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => ({ n: e.name, s: e.transferSize, d: e.duration })),
  );
  const has = (frag) => res.some((r) => r.n.includes(frag));
  ok(has("/assets/index-") && has("phaser-") && has("colyseus-"), "③ 三大主包已加载", `共 ${res.length} 个资源`);
  const biggest = res.sort((x, y) => y.d - x.d)[0];
  ok(true, "③ 最慢资源", biggest ? `${biggest.n.split("/").pop()} ${biggest.d.toFixed(0)}ms` : "");

  // 建房
  await page.fill("#password", "brows1");
  await page.click("#btn-create");
  await page.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
  const roomCode = await page.textContent("#hud-room");
  ok(true, "④ 建房拿到房间码", String(roomCode).trim().slice(0, 30));

  await page.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 45000 });
  ok(true, "⑤ 进入 Game 场景");

  // 观察 5 秒，让物理/渲染跑起来
  await page.waitForTimeout(5000);

  // 游戏内状态：场景 active、有角色、帧在走
  const game = await page.evaluate(() => {
    const fw = globalThis.__fw;
    const sc = fw.scene.getScene("Game");
    return {
      active: fw.scene.isActive("Game"),
      fps: Math.round(fw.loop?.actualFps ?? 0),
      isPlaying: sc?.sys?.isActive?.() ?? null,
      textures: fw.textures.getTextureKeys().length,
      sceneKeys: fw.scene.scenes.map((s) => s.scene.key),
    };
  });
  ok(game.active, "⑥ Game 仍在 active", `fps=${game.fps} 纹理=${game.textures}`);

  ok(pageErrors.length === 0, "⑦ 零 pageerror", pageErrors.length ? JSON.stringify(pageErrors.slice(0, 2)) : "");
  ok(consoleErrors.length === 0, "⑧ 零 console.error", consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 2)) : "");
  ok(failedReqs.length === 0, "⑨ 零失败请求", failedReqs.length ? JSON.stringify(failedReqs.slice(0, 3)) : "");
  ok(badStatus.length === 0, "⑩ 零 4xx/5xx 响应", badStatus.length ? JSON.stringify(badStatus.slice(0, 3)) : "");

  if (SHOT) {
    await page.screenshot({ path: SHOT });
    console.log(`[shot] ${SHOT}`);
  }
  await page.close();
} catch (err) {
  ok(false, "浏览器流程", String(err).slice(0, 300));
} finally {
  await browser.close();
}

console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== 浏览器测试全绿 ===");
process.exit(fails.length ? 1 : 0);

#!/usr/bin/env node
/**
 * 外网真触屏测试：用 iPhone 描述符 + CDP 人手量级按压（touchStart→hold 90ms→touchEnd），
 * 验证三键虚拟按键在外网部署环境下真的能驱动角色。
 *
 * 为什么不用 page.touchscreen.tap：Playwright 1.63 把 touchStart/End 并发齐发，
 * Chromium 同任务合成 → 服务端同一 tick 消费 down+up 对消，Δ=0（假失败）。
 * 见 scripts/e2e/touch.mjs 头注取证。
 *
 * 用法：node TEMP/touch-ext-test.mjs [--base http://110.42.36.114:2567]
 */
import { chromium, devices } from "playwright";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://110.42.36.114:2567");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fails = [];
const ok = (c, label, detail = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!c) fails.push(label);
};

const playerPos = (page, role) => page.evaluate((r) => {
  const scene = globalThis.__fw.scene.getScene("Game");
  const v = scene.views.get(r);
  return { x: v.legs.x, y: v.legs.y };
}, role);

async function touchTap(cdp, x, y, holdMs = 90) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await sleep(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
try {
  // A. 手机建（火娃）
  const iphone = await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN" });
  const t = await iphone.newPage();
  const errs = [];
  t.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));

  await t.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await t.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  await t.fill("#password", "touch1");
  await t.click("#btn-create");
  await t.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
  const code = ((await t.textContent("#hud-room")).match(/房间码 ([^（\s]+)/) || [])[1];
  await t.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 60000 });
  ok(!!code, "① 手机端建房进 Game", `roomId=${code}`);

  // B. 桌面加入（水娃）
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const d = await desktop.newPage();
  d.on("pageerror", (e) => errs.push(`D: ${String(e).slice(0, 150)}`));
  await d.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await d.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  await d.fill("#password", "touch1");
  await d.fill("#roomcode", code);
  await d.click("#btn-join");
  const started = await d.waitForFunction(
    () => String(globalThis.__fwInit?.net?.room?.state?.phase ?? "") === "started", null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  ok(started, "② 双人进入 started");

  await sleep(800);

  // 1) 三键可见且可点
  const vis = await t.evaluate(() => {
    const root = document.querySelector("#touch-controls");
    if (!root) return { exists: false };
    const btns = [...root.querySelectorAll(".touch-btn")];
    return {
      exists: true,
      hidden: root.classList.contains("hidden"),
      n: btns.length,
      allBoxed: btns.every((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
      clips: [...root.querySelectorAll(".touch-btn")].map((b) => {
        const r = b.getBoundingClientRect();
        return { l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight,
                 offscreen: r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 };
      }),
    };
  });
  ok(vis.exists && !vis.hidden && vis.n === 3 && vis.allBoxed, "③ 三键虚拟按键可见可点", `n=${vis.n}`);
  const offscreen = (vis.clips ?? []).filter((c) => c.offscreen);
  ok(offscreen.length === 0, "③ 三键都在视口内（窄屏不越界）", offscreen.length ? JSON.stringify(offscreen) : `${vis.clips?.[0]?.vw}x${vis.clips?.[0]?.vh}`);

  // 2) tap 跳跃 → y 上抬
  const cdp = await iphone.newCDPSession(t);
  const before = await playerPos(t, "fireboy");
  const jb = await (await t.$(".touch-btn.jump")).boundingBox();
  await touchTap(cdp, jb.x + jb.width / 2, jb.y + jb.height / 2, 240);
  let minY = before.y;
  for (let i = 0; i < 30; i++) { await sleep(40); const p = await playerPos(t, "fireboy"); minY = Math.min(minY, p.y); }
  ok(before.y - minY > 30, "④ 触屏 tap 跳跃 → 角色上抬 >30px", `Δy=${(before.y - minY).toFixed(1)}px`);

  // 3) 按住右键 → x 右移
  const p0 = await playerPos(t, "fireboy");
  const rb = await (await t.$(".touch-btn.right")).boundingBox();
  await t.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await t.mouse.down();
  await sleep(1500);
  const p1 = await playerPos(t, "fireboy");
  await t.mouse.up();
  ok(p1.x - p0.x > 100, "⑤ 触屏按住右键 1.5s → 右移 >100px", `Δx=${(p1.x - p0.x).toFixed(1)}px`);

  // 4) 桌面端不该有虚拟按键
  const desktopHas = await d.evaluate(() => {
    const root = document.querySelector("#touch-controls");
    if (!root) return false;
    return !root.classList.contains("hidden") && root.querySelectorAll(".touch-btn").length > 0;
  });
  ok(!desktopHas, "⑥ 桌面端不显示虚拟按键（仅粗指针设备创建）");

  ok(errs.length === 0, "⑦ 双端零 pageerror", errs.length ? JSON.stringify(errs.slice(0, 2)) : "");
  await t.screenshot({ path: "TEMP/shot-touch.png" });
} catch (err) {
  ok(false, "触屏流程", String(err).slice(0, 300));
} finally {
  await browser.close();
}

console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== 外网触屏测试全绿 ===");
process.exit(fails.length ? 1 : 0);

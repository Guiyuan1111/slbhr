#!/usr/bin/env node
/**
 * 诊断：触屏跳跃键为什么 Δy=0。
 * 分三层定位：① pointerdown 是否触发（.on 类）② 服务端是否收到 up 输入
 * ③ 角色 y 是否变化。
 */
import { chromium, devices } from "playwright";

const BASE = process.env.FW_BASE ?? "http://110.42.36.114:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const iphone = await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN" });
const t = await iphone.newPage();
t.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await t.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded", timeout: 60000 });
await t.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
await t.fill("#password", "dbg123");
await t.click("#btn-create");
await t.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
const code = ((await t.textContent("#hud-room")).match(/房间码 ([^（\s]+)/) || [])[1];
await t.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 60000 });

// 桌面加入，凑够两人进 started
const desktop = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const d = await desktop.newPage();
await d.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded", timeout: 60000 });
await d.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
await d.fill("#password", "dbg123");
await d.fill("#roomcode", code);
await d.click("#btn-join");
await t.waitForFunction(() => String(globalThis.__fwInit?.net?.room?.state?.phase ?? "") === "started", null, { timeout: 30000 });
await sleep(1000);

// 装探针：记录 pointerdown/up 与 onPress 注入
await t.evaluate(() => {
  globalThis.__probe = { down: 0, up: 0, touchstart: 0 };
  const btn = document.querySelector(".touch-btn.jump");
  btn.addEventListener("pointerdown", () => { globalThis.__probe.down++; }, true);
  btn.addEventListener("pointerup", () => { globalThis.__probe.up++; }, true);
  btn.addEventListener("touchstart", () => { globalThis.__probe.touchstart++; }, true);
});

const jb = await (await t.$(".touch-btn.jump")).boundingBox();
console.log("[btn] jump boundingBox =", JSON.stringify(jb));

const pos = () => t.evaluate(() => {
  const sc = globalThis.__fw.scene.getScene("Game");
  const v = sc.views.get("fireboy");
  return { x: Math.round(v.legs.x), y: Math.round(v.legs.y) };
});

const p0 = await pos();
const cdp = await iphone.newCDPSession(t);

// 方式 1：CDP touchStart → 240ms → touchEnd（更长按压）
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: jb.x + jb.width / 2, y: jb.y + jb.height / 2 }] });
await sleep(240);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
let minY = p0.y;
for (let i = 0; i < 25; i++) { await sleep(40); const p = await pos(); minY = Math.min(minY, p.y); }
const probe1 = await t.evaluate(() => globalThis.__probe);
console.log(`[CDP touch] probe=${JSON.stringify(probe1)} y ${p0.y} → min ${minY}（Δ=${p0.y - minY}）`);

// 方式 2：真实 pointer 序列（mouse down/up，验证物理侧）
const p1 = await pos();
await t.mouse.move(jb.x + jb.width / 2, jb.y + jb.height / 2);
await t.mouse.down();
await sleep(240);
await t.mouse.up();
let minY2 = p1.y;
for (let i = 0; i < 25; i++) { await sleep(40); const p = await pos(); minY2 = Math.min(minY2, p.y); }
const probe2 = await t.evaluate(() => globalThis.__probe);
console.log(`[pointer]   probe=${JSON.stringify(probe2)} y ${p1.y} → min ${minY2}（Δ=${p1.y - minY2}）`);

// 方式 3：直接用键盘上键（验证物理侧本身能跳）
const p2 = await pos();
await t.keyboard.down("ArrowUp");
await sleep(240);
await t.keyboard.up("ArrowUp");
let minY3 = p2.y;
for (let i = 0; i < 25; i++) { await sleep(40); const p = await pos(); minY3 = Math.min(minY3, p.y); }
console.log(`[keyboard]  y ${p2.y} → min ${minY3}（Δ=${p2.y - minY3}）`);

await browser.close();

#!/usr/bin/env node
/**
 * 外网真操作测试：两个浏览器上下文各模拟一名真人，建房 / 用邀请链接加入 / 进 Game /
 * 按方向键，断言**角色真的位移**（物理层生效），且**队友画面也看到该位移**
 * （服务端权威同步）——不只是「画面出来了」。
 *
 * 用法：
 *   node TEMP/play-test.mjs [--base http://110.42.36.114:2567] [--level forest_01]
 *
 * 判据：
 *  ① 房主建房拿到房间码、队友用邀请链接进 Game
 *  ② 房主按键后自己画面角色 x 真的改变
 *  ③ 队友画面里该角色 x 也跟着变（服务端权威，不是本地各自算）
 *  ④ 时钟在走（不是 00:00 冻死）
 *  ⑤ 双端零 pageerror
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://110.42.36.114:2567");
const LEVEL = argOf("level", "forest_01");

const fails = [];
const ok = (c, label, detail = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!c) fails.push(label);
};

/** 从服务端同步状态读角色逻辑坐标（GameScene 每帧从 state.players 取；这里直接读 state） */
const readState = () => {
  const init = globalThis.__fwInit ?? {};
  const room = init.net?.room ?? null;
  const st = room?.state ?? null;
  const out = { phase: String(st?.phase ?? ""), timer: Number(st?.timerMs ?? 0), players: {} };
  try {
    for (const role of ["fireboy", "watergirl"]) {
      const p = st?.players?.get?.(role);
      if (p) out.players[role] = { x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) };
    }
  } catch { /* 集合未就绪 */ }
  return out;
};

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const errs = [];

try {
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  A.on("pageerror", (e) => errs.push(`A: ${String(e).slice(0, 150)}`));
  B.on("pageerror", (e) => errs.push(`B: ${String(e).slice(0, 150)}`));

  // ---- A 建房 ----
  await A.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await A.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  await A.fill("#password", "play12");
  await A.click("#btn-create");
  await A.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
  // 房间码纯文本在 <b> 里
  const roomId = (await A.textContent("#hud-room b"))?.trim() ?? "";
  ok(/^[A-Za-z0-9_-]{6,}$/.test(roomId), "① 房主建房并取得房间码", `roomId=${roomId}`);
  await A.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 60000 });
  ok(true, "① 房主进入 Game");

  // ---- B 用邀请深链加入（与真人分享链接路径一致：?room= 回填，手动填同一密码）----
  await B.goto(`${BASE}/?level=${LEVEL}&room=${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await B.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  const prefilled = await B.inputValue("#roomcode");
  ok(prefilled === roomId, "① 邀请链接自动回填房间码", `#roomcode=${prefilled}`);
  await B.fill("#password", "play12");
  await B.click("#btn-join");
  const bInGame = await B.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 60000 })
    .then(() => true).catch(() => false);
  ok(bInGame, "① 队友进入 Game", bInGame ? "" : "（加入路径失败）");

  // 等 ready→started（原版 2.0s 开钟）
  const startedA = await A.waitForFunction(
    () => String(globalThis.__fwInit?.net?.room?.state?.phase ?? "") === "started",
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  ok(startedA, "① 双人到齐进入 started", "");

  const before = { A: await A.evaluate(readState), B: await B.evaluate(readState) };
  console.log("[state] 按键前 A:", JSON.stringify(before.A), "\n             B:", JSON.stringify(before.B));

  // ---- A 按住右方向键 1.5s（房主是 fireboy，用方向键）----
  await A.bringToFront();
  await A.keyboard.down("ArrowRight");
  await A.waitForTimeout(1500);
  await A.keyboard.up("ArrowRight");
  await A.waitForTimeout(800); // 留时间让服务端 patch 到 B

  const after = { A: await A.evaluate(readState), B: await B.evaluate(readState) };
  console.log("[state] 按键后 A:", JSON.stringify(after.A), "\n             B:", JSON.stringify(after.B));

  const dxOf = (s) => s.players.fireboy ? s.players.fireboy.x : null;
  const movedA = dxOf(before.A) !== null && dxOf(after.A) !== null && Math.abs(dxOf(after.A) - dxOf(before.A)) >= 10;
  ok(movedA, "② 按键后 fireboy 真的位移（物理生效）", `x: ${dxOf(before.A)} → ${dxOf(after.A)}`);

  const movedB = dxOf(before.B) !== null && dxOf(after.B) !== null &&
    Math.abs(dxOf(after.B) - dxOf(before.B)) >= 10;
  ok(movedB, "③ 队友画面同步到同一位移（服务端权威）", `x: ${dxOf(before.B)} → ${dxOf(after.B)}`);

  // 两端看到的坐标应当是同一个数（同一份权威状态）
  const agree = dxOf(after.A) === dxOf(after.B);
  ok(agree, "③ 两端角色坐标一致", `A=${dxOf(after.A)} B=${dxOf(after.B)}`);

  // 时钟前进
  const timerGrew = after.A.timer > before.A.timer || after.A.timer > 1000;
  ok(timerGrew, "④ 对局时钟在走", `timerMs ${before.A.timer} → ${after.A.timer}`);

  ok(errs.length === 0, "⑤ 双端零 pageerror", errs.length ? JSON.stringify(errs.slice(0, 3)) : "");

  await A.screenshot({ path: "TEMP/shot-play-A.png" });
  await B.screenshot({ path: "TEMP/shot-play-B.png" });
} catch (err) {
  ok(false, "双人操作流程", String(err).slice(0, 300));
} finally {
  await ctxA.close();
  await ctxB.close();
  await browser.close();
}

console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== 双人操作测试全绿 ===");
process.exit(fails.length ? 1 : 0);

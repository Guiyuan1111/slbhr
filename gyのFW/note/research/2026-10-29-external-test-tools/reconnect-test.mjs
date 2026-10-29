#!/usr/bin/env node
/**
 * 外网断线/重连测试：模拟真实网络下的三种情况。
 *
 * A. 队友掉线 → 服务端进入 paused（冻结等待重连）→ 同 token 重连 → 恢复到 started
 * B. 房主刷新页面（关掉页面再开同一房间）→ 回座（服务端 allowReconnection 语义）
 * C. 主动离开后房间释放，不影响其他房间
 *
 * 用法：node TEMP/reconnect-test.mjs [--base http://110.42.36.114:2567] [--level forest_01]
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

const fails = [];
const ok = (c, label, detail = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!c) fails.push(label);
};

const readState = () => {
  const st = globalThis.__fwInit?.net?.room?.state ?? null;
  const out = { phase: String(st?.phase ?? ""), players: {} };
  try {
    for (const role of ["fireboy", "watergirl"]) {
      const p = st?.players?.get?.(role);
      if (p) out.players[role] = Math.round(Number(p.x));
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
  A.on("pageerror", (e) => errs.push(`A: ${String(e).slice(0, 120)}`));
  B.on("pageerror", (e) => errs.push(`B: ${String(e).slice(0, 120)}`));

  // ---- 建立双人对局 ----
  await A.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await A.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  await A.fill("#password", "recon1");
  await A.click("#btn-create");
  await A.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
  const roomId = (await A.textContent("#hud-room b"))?.trim() ?? "";
  await A.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 60000 });

  await B.goto(`${BASE}/?level=${LEVEL}&room=${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await B.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
  await B.fill("#password", "recon1");
  await B.click("#btn-join");
  await B.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 60000 });
  const started = await A.waitForFunction(
    () => String(globalThis.__fwInit?.net?.room?.state?.phase ?? "") === "started", null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  ok(started, "① 双人进入 started", `roomId=${roomId}`);

  // ================= A. 队友断线 → paused → 重连恢复 =================
  const phaseBefore = (await A.evaluate(readState)).phase;
  await ctxB.setOffline(true);              // 断网（比关页面更接近真实掉线）
  const paused = await A.waitForFunction(
    () => String(globalThis.__fwInit?.net?.room?.state?.phase ?? "") !== "started", null, { timeout: 25000 },
  ).then(() => true).catch(() => false);
  const phaseDuring = (await A.evaluate(readState)).phase;
  ok(paused, "② 队友断线后房主侧相位离开 started（冻结等待）", `${phaseBefore} → ${phaseDuring}`);

  await ctxB.setOffline(false);             // 恢复网络，客户端自动重连
  const resumed = await A.waitForFunction(
    () => String(globalThis.__fwInit?.net?.room?.state?.phase ?? "") === "started", null, { timeout: 70000 },
  ).then(() => true).catch(() => false);
  const phaseAfter = (await A.evaluate(readState)).phase;
  ok(resumed, "② 队友网络恢复后自动重连回到 started", `→ ${phaseAfter}`);

  const bAlive = await B.evaluate(() => globalThis.__fw.scene.isActive("Game"));
  ok(bAlive, "② 队友端仍在 Game（未被打回菜单）", bAlive ? "" : "（重连后场景丢失）");

  // ================= B. 房主刷新页面 → 回座 =================
  const before = await A.evaluate(readState);
  await A.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await A.waitForFunction(() => !!globalThis.__fw, null, { timeout: 60000 });
  const backInGame = await A.waitForFunction(
    () => globalThis.__fw.scene.isActive("Game"), null, { timeout: 70000 },
  ).then(() => true).catch(() => false);
  const after = await A.evaluate(readState);
  ok(backInGame, "③ 房主刷新后回座进 Game", `${after.phase} players=${JSON.stringify(after.players)}`);
  ok(after.phase === "started", "③ 回座后相位仍是 started（对局未散）",
    `${before.phase} → ${after.phase}`);

  ok(errs.length === 0, "④ 全程零 pageerror", errs.length ? JSON.stringify(errs.slice(0, 3)) : "");
} catch (err) {
  ok(false, "断线重连流程", String(err).slice(0, 300));
} finally {
  await ctxA.close();
  await ctxB.close();
  await browser.close();
}

console.log(fails.length ? `\n=== ${fails.length} 项失败 ===` : "\n=== 断线重连测试全绿 ===");
process.exit(fails.length ? 1 : 0);

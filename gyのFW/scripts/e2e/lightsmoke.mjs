// light 端到端冒烟：FORCE_DOORS 通关 light_01 → 活房间 advance 到 light_02 → 再通
// （证：light 关装载/房间/门/胜利管线/换关链全通；FW_DEBUG_FORCE_DOORS=1 为既有服务端测试钩子）
import { chromium } from "playwright";
import { startServer, enterAs, log, PASSWORD } from "./lib.mjs";
const PORT = 3671;
const server = await startServer(PORT, { FW_DEBUG_FORCE_DOORS: "1" });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const a = await ctxA.newPage();
const b = await ctxB.newPage();
let fail = 0;
const check = (name, ok, extra = "") => { log(`${ok ? "✓" : "✗"} ${name}${extra ? " —— " + extra : ""}`); if (!ok) fail++; };
let codeOfA = "";
try {
  await enterAs(a, PORT, "create", "", "light_01");
  for (let i = 0; i < 10 && codeOfA.length < 4; i++) {
    await a.waitForTimeout(400);
    codeOfA = ((await a.textContent("#hud-room").catch(() => "")) || "").match(/房间码 ([^（\s]+)/)?.[1] ?? "";
  }
  console.log("[smoke] 房间码:", codeOfA);
} catch {
  console.log("[smoke] create 失败，menu-error:", await a.textContent("#menu-error").catch(() => "?"), "| hud-room:", await a.textContent("#hud-room").catch(() => "?"));
  throw new Error("create fail");
}
let joined = false;
for (let i = 0; i < 3 && !joined; i++) {
  try { await enterAs(b, PORT, "join", codeOfA, "light_01"); joined = true; }
  catch { console.log("[smoke] join 第" + (i + 1) + "次失败重试"); }
}
if (!joined) throw new Error("join 3 连败");
await a.waitForFunction(() => document.querySelector("#hud-status")?.textContent === "", null, { timeout: 25000 });
const levelId1 = await a.evaluate(() => window.__fwInit?.net?.room?.state?.levelId ?? "?");
check("light_01 开局", String(levelId1).startsWith("light_01"), "levelId=" + levelId1);
const won1 = await a.waitForFunction(() => String(window.__fwInit?.net?.room?.state?.phase ?? "") === "won", null, { timeout: 40000 }).then(() => true).catch(() => false);
check("FORCE_DOORS 通关 light_01（phase=won）", won1);
// advance 换关：EndMenu Continue？journey 用 __fwNextLevel——查其调用式
await a.evaluate(() => window.__fwNextLevel?.());
await a.waitForFunction(() => String(window.__fwInit?.net?.room?.state?.levelId ?? "").startsWith("light_02"), null, { timeout: 25000 }).then(() => true).catch(() => false);
const levelId2 = await a.evaluate(() => window.__fwInit?.net?.room?.state?.levelId ?? "?");
check("活房间 advance → light_02", String(levelId2).startsWith("light_02"), "levelId=" + levelId2);
await a.waitForFunction(() => String(window.__fwInit?.net?.room?.state?.phase ?? "") === "won", null, { timeout: 40000 }).then(() => true).catch(() => false);
const won2 = await a.evaluate(() => window.__fwInit?.net?.room?.state?.phase);
check("light_02 再通关", won2 === "won", "phase=" + won2);
log(fail === 0 ? "lightsmoke: ALL PASS" : `lightsmoke: ${fail} FAIL`);
await browser.close();
server.kill();
process.exit(fail === 0 ? 0 : 1);

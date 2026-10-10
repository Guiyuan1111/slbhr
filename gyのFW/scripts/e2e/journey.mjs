/**
 * e2e 行为层·自验收场景（note/self-acceptance.md L3）——每个场景复现一类「实玩才暴露」的用户旅程。
 *
 * 用法（Git Bash，先注入便携 Node PATH；构建产物由调用方保证）：
 *   node scripts/e2e/journey.mjs journey [--port 3571]   # 通关→继续→forest_02 新房开局（全旅程，需 FW_DEBUG_FORCE_DOORS 加速到门）
 *   node scripts/e2e/journey.mjs pause   [--port 3572]   # KeyP 暂停：服务端收到「全松」冲刷、角色停驱（0.3.27 setPaused 修复回归）
 *   node scripts/e2e/journey.mjs rejoin  [--port 3573]   # 断线超时→补位重进：房间整关重开而非死房（0.3.27 onLeave 修复回归；用 FW_RECONNECT_SECONDS 缩窗）
 *
 * 断言全部读权威 state 或服务端日志，不依赖 DOM 轮询文本。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { OUT, PASSWORD, argOf, enterAs, log, readRole, roomState, startServer, waitForStarted } from "./lib.mjs";

const argv = process.argv.slice(2);
const MODE = argv[0] ?? "journey";
const PORT = Number(argOf(argv, "port", "3571"));

const results = { mode: MODE, pass: false, checks: [] };
const check = (name, ok, detail = "") => {
  results.checks.push({ name, ok, detail });
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
  return ok;
};

let server;
try {
  server = await startServer(PORT, MODE === "journey" ? { FW_DEBUG_FORCE_DOORS: "1" } : MODE === "rejoin" ? { FW_RECONNECT_SECONDS: "4" } : {});
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio"] });

  if (MODE === "journey") {
    // ── 场景 1：全旅程 —— forest_01 通关 → EndMenu「继续」→ 预选 forest_02 → 弹联机面板 → 新房开局
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    log(`[journey] 房间 ${code} 开局，等待 FORCE_DOORS 通关`);
    let won = false;
    for (let i = 0; i < 30; i++) {
      await a.waitForTimeout(1000);
      if ((await a.textContent("#hud-status")) === "通关！") { won = true; break; }
    }
    check("forest_01 通关（HUD 通关！）", won);
    await a.waitForTimeout(3200); // 楼梯 1600ms + 星动画 + 继续钮启用 2.9s

    // 双方各自点「继续」（EndMenu 按钮 handler = __fwNextLevel，此处直调排除像素点击抖动）
    for (const [tag, page] of [["A", a], ["B", b]]) {
      await page.evaluate(() => window.__fwNextLevel());
      const menuVisible = await page.evaluate(() => !document.querySelector("#menu")?.classList.contains("hidden"));
      const levelText = await page.textContent("#menu-level");
      check(`${tag} 联机面板弹出并预选下一关`, menuVisible && levelText === "已选关卡：forest_02", levelText ?? "");
    }
    // 房主创建 forest_02 新房，加入方按码进入
    await a.fill("#password", PASSWORD);
    await a.click("#btn-create");
    await a.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
    const roomText = await a.textContent("#hud-room");
    const code2 = (roomText.match(/房间码 ([^（\s]+)/) || [])[1] ?? "";
    check("forest_02 新房创建", Boolean(code2), code2);
    await b.fill("#password", PASSWORD);
    await b.fill("#roomcode", code2);
    await b.click("#btn-join");
    await b.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
    await waitForStarted(a);
    await waitForStarted(b);
    const lvl = await roomState(a, `String(s.levelId)`);
    const phase = await roomState(a, `String(s.phase)`);
    check("forest_02 新房 ready→started 且 levelId 正确", lvl === "forest_02" && phase === "started", `levelId=${lvl} phase=${phase}`);
    check("新局角色分配（A=火人）", (await readRole(a)).includes("火人"), await readRole(a));
    await a.screenshot({ path: join(OUT, "journey-forest02-a.png") });
    await b.screenshot({ path: join(OUT, "journey-forest02-b.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "pause") {
    // ── 场景 2：本地暂停输入冲刷 —— 按住右行走 → KeyP：服务端必须收到「全松」，
    // anim 回 idle（服务端停驱）；再按 P 恢复。0.3.27 前置位后 emit 被闸拦，末次按住态
    // 留在服务端 → anim 恒 jumping（角色持续怼墙）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    await a.keyboard.down("ArrowRight");
    await a.waitForTimeout(700);
    const animMoving = await roomState(a, `String(s.players.get("fireboy").anim)`);
    check("按住右 → 服务端驱动行走（anim=jumping）", animMoving === "jumping", `anim=${animMoving}`);
    await a.keyboard.press("p");
    await a.waitForTimeout(700);
    const animPaused = await roomState(a, `String(s.players.get("fireboy").anim)`);
    check("KeyP 暂停 → 「全松」冲刷到服务端（anim=idle）", animPaused === "idle", `anim=${animPaused}`);
    const phase = await roomState(a, `String(s.phase)`);
    check("本地暂停不改服务端相位（AFK 语义）", phase === "started", `phase=${phase}`);
    await a.keyboard.press("p");
    await a.waitForTimeout(500);
    // 暂停即冲刷：物理上仍按着的键不会自动恢复（这正是防「挂后台卡键」的语义），
    // 恢复后需重按才重新驱动——验证暂停闸确实已放开
    await a.keyboard.up("ArrowRight");
    await a.keyboard.down("ArrowRight");
    await a.waitForTimeout(500);
    const animResumed = await roomState(a, `String(s.players.get("fireboy").anim)`);
    check("再按 P 恢复 → 重按右重新驱动（anim=jumping）", animResumed === "jumping", `anim=${animResumed}`);
    await a.keyboard.up("ArrowRight");
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "rejoin") {
    // ── 场景 3：断线超时 → 补位重进 —— B 断线，FW_RECONNECT_SECONDS=4 缩窗；
    // 超时后座位释放、相位回 lobby；新人按码补位 → 整关重开 ready→started，
    // 而非 0.3.27 之前的 phase 永久卡 paused 死房。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    log(`[rejoin] 房间 ${code} 开局，关闭 B 模拟断线（4s 重连窗）`);
    await ctxB.close();
    await a.waitForTimeout(6000); // 超过重连窗：座位释放 + phase→lobby
    const phaseAfter = await roomState(a, `String(s.phase)`);
    check("重连超时后相位回 lobby（可补位）", phaseAfter === "lobby", `phase=${phaseAfter}`);
    const b2 = await ctxA.newPage();
    await enterAs(b2, PORT, "join", code, "forest_01");
    await waitForStarted(b2);
    await waitForStarted(a);
    const lvl = await roomState(a, `String(s.levelId)`);
    const phase = await roomState(a, `String(s.phase)`);
    const role = await readRole(b2);
    check("补位重进 → 整关重开 ready→started", lvl === "forest_01" && phase === "started", `levelId=${lvl} phase=${phase}`);
    check("补位者获得水女孩席位", role.includes("水女孩"), role);
    await a.screenshot({ path: join(OUT, "rejoin-a.png") });
    await b2.screenshot({ path: join(OUT, "rejoin-b2.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
  } else {
    throw new Error(`未知模式: ${MODE}（可用 journey|pause|rejoin）`);
  }

  await browser.close();
} finally {
  server?.kill();
}
writeFileSync(join(OUT, `journey-${MODE}.json`), JSON.stringify(results, null, 2));
console.log(`[e2e] ${MODE}: ${results.pass ? "ALL PASS" : "FAILED"}（${results.checks.filter((c) => c.ok).length}/${results.checks.length} 项）`);
process.exit(results.pass ? 0 : 1);

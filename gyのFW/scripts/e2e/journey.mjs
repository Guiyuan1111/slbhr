/**
 * e2e 行为层·自验收场景（note/self-acceptance.md L3）——每个场景复现一类「实玩才暴露」的用户旅程。
 *
 * 用法（Git Bash，先注入便携 Node PATH；构建产物由调用方保证）：
 *   node scripts/e2e/journey.mjs journey [--port 3571]   # 通关→继续→活房间 advance 同房换关 forest_02（全旅程，需 FW_DEBUG_FORCE_DOORS 加速到门）
 *   node scripts/e2e/journey.mjs pause   [--port 3572]   # KeyP 暂停：服务端权威全场物理冻结+时钟停摆，恢复推进；含二次暂停/恢复（PauseMenu closing 复位，H1）
 *   node scripts/e2e/journey.mjs leave   [--port 3575]   # 主动返回菜单：4000 关闭码不得触发重连横幅，余端回 lobby（H3）
 *   node scripts/e2e/journey.mjs refresh [--port 3586]   # 刷新回座：started 相机解冻（H2）+重连新令牌可再次回座（M1）
 *   node scripts/e2e/journey.mjs wonrefresh [--port 3587] # won 相位刷新回座：服务端补发 finish 后客户端主动重开 EndMenu（L-02）
 *   node scripts/e2e/journey.mjs rejoin  [--port 3573]   # 断线超时→补位重进：房间整关重开而非死房（0.3.27 onLeave 修复回归；用 FW_RECONNECT_SECONDS 缩窗）
 *   node scripts/e2e/journey.mjs deathretry [--port 3574] # 死亡→gameover 静置（原版无自动重开）→Retry 整关重开（F2 翻转回归）
 *   node scripts/e2e/journey.mjs rolesplit [--port 3576] # 按角色分键：fb 只认方向键/wg 只认 WASD，跨组键免疫（F1 翻转回归）
 *   node scripts/e2e/journey.mjs backmenu [--port 3577] # r43 开始界面独占四图：进房交还、返回 Menu 重取且尺寸正确
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
  server = await startServer(PORT, MODE === "journey" ? { FW_DEBUG_FORCE_DOORS: "1" } : MODE === "rejoin" ? { FW_RECONNECT_SECONDS: "4" } : MODE === "wonrefresh" ? { FW_DEBUG_FORCE_DOORS: "1", FW_RECONNECT_SECONDS: "15" } : {});
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio"] });

  if (MODE === "journey") {
    // ── 场景 1：全旅程 —— forest_01 通关 → EndMenu「继续」→ 活房间 advance 同房换关
    // forest_02（0.3.12 语义：服务端仅 won 受理，席位保留、双端按 levelId 回声各自
    // 重建 Game；不再回大厅弹联机面板重建房——旧断言「面板弹出并预选下一关」随该
    // 语义退役。0.3.37 换关走黑幕包络（FadeScene 500ms×2），等待全部状态轮询不写死）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    log(`[journey] 房间 ${code} 开局，等待 FORCE_DOORS 通关`);
    // 通关判定读权威 phase（DOM 文本轮询有 250ms 假空窗，且 updateHud 4Hz 慢一拍）
    const stateGate = (expr) => `(() => { try { const s = window.__fwInit.net.room.state; return (${expr}); } catch { return false; } })()`;
    let won = false;
    try { await a.waitForFunction(stateGate(`s.phase === "won"`), null, { timeout: 45000 }); won = true; } catch { /* 超时按失败记 */ }
    check("forest_01 通关（phase=won）", won);
    // 双方各自点「继续」（EndMenu 按钮 handler = __fwNextLevel，直调排除像素点击抖动；
    // 活房间 advance 仅 won 受理，双端各发一次时第二发在 ready 相位被服务端天然忽略）
    for (const page of [a, b]) {
      await page.evaluate(() => window.__fwNextLevel());
    }
    // 双端 levelId 回声（onLevelId 差分 → reloadLevel 黑幕换关）
    await a.waitForFunction(stateGate(`s.levelId === "forest_02"`), null, { timeout: 15000 });
    await b.waitForFunction(stateGate(`s.levelId === "forest_02"`), null, { timeout: 15000 });
    const codeA = ((await a.textContent("#hud-room")).match(/房间码 ([^（\s]+)/) || [])[1] ?? "";
    check("A/B 双端 advance 换关 forest_02（同房留场，房间码不变）", codeA === code, `${code}→${codeA}`);
    // 换关不回大厅：联机面板保持隐藏，EndMenu 已关、Game 已重建（黑幕包络完成后轮询到位）
    await a.waitForFunction(
      `(() => { try { const g = window.__fw.scene; return !g.isActive("EndMenu") && g.isActive("Game"); } catch { return false; } })()`,
      null, { timeout: 15000 },
    );
    const menuHiddenA = await a.evaluate(() => document.querySelector("#menu")?.classList.contains("hidden") ?? false);
    const menuHiddenB = await b.evaluate(() => document.querySelector("#menu")?.classList.contains("hidden") ?? false);
    check("换关不回大厅（联机面板不弹出，EndMenu 关、Game 重建）", menuHiddenA && menuHiddenB, `menuHidden A=${menuHiddenA} B=${menuHiddenB}`);
    await waitForStarted(a);
    await waitForStarted(b);
    const lvl = await roomState(a, `String(s.levelId)`);
    const phase = await roomState(a, `String(s.phase)`);
    check("forest_02 ready→started 且 levelId 正确", lvl === "forest_02" && phase === "started", `levelId=${lvl} phase=${phase}`);
    check("席位保留（A=火人）", (await readRole(a)).includes("火人"), await readRole(a));
    check("席位保留（B=水女孩）", (await readRole(b)).includes("水女孩"), await readRole(b));
    // 新关活局：权威时钟续走（旧场景「新房创建/按码加入」半段随 0.3.12 语义退役——
    // 建/加入房链路由其余四场景入场段常态覆盖）
    const t1 = await roomState(a, `Number(s.timerMs)`);
    let ticked = false;
    try { await a.waitForFunction(stateGate(`Number(s.timerMs) > ${t1}`), null, { timeout: 5000 }); ticked = true; } catch { /* 超时按失败记 */ }
    const t2 = await roomState(a, `Number(s.timerMs)`);
    check("forest_02 新关活局（权威时钟续走）", ticked && t2 > t1, `t ${t1}→${t2}`);
    await a.screenshot({ path: join(OUT, "journey-forest02-a.png") });
    await b.screenshot({ path: join(OUT, "journey-forest02-b.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "pause") {
    // ── 场景 2：暂停全场物理冻结（F3 翻转回归，原版 E4 togglePause=game.paused）——
    // 双方各按住行进键 → 一端 KeyP：服务端权威冻结，双端位置/时钟停摆（anim 停在
    // jumping，不再是旧 AFK 语义的「全松冲刷回 idle」）；再按 P 恢复，暂停期按住的键
    // 恢复瞬间生效（原版键掩码语义；服务端冻结期输入照常入队，恢复即归帧）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    const snapOf = (page) => roomState(page, `JSON.stringify({ fx: s.players.get("fireboy").x, wx: s.players.get("watergirl").x, t: s.timerMs, fa: String(s.players.get("fireboy").anim) })`);
    await a.keyboard.down("ArrowRight");
    await b.keyboard.down("KeyD");
    await a.waitForTimeout(600);
    const run1 = JSON.parse(await snapOf(a));
    check("按住行进键 → 服务端驱动行走（anim=jumping）", run1.fa === "jumping", `anim=${run1.fa}`);
    await a.keyboard.press("p");
    // 按键→服务端受理有 1-3 帧固有延迟（网络+tick），冻结前最后一两步会继续走——
    // 双采样断言：+600ms 冻结必已稳定，再等 400ms 取第二样，两位级相等才算冻结
    await a.waitForTimeout(600);
    const frozen1 = JSON.parse(await snapOf(a));
    await a.waitForTimeout(400);
    const frozen2 = JSON.parse(await snapOf(a));
    check("KeyP 暂停 → fb 位置冻结", frozen2.fx === frozen1.fx, `x ${frozen1.fx}→${frozen2.fx}`);
    check("全场冻结 → wg（B 端）位置同冻结", frozen2.wx === frozen1.wx, `x ${frozen1.wx}→${frozen2.wx}`);
    check("冻结 → 时钟停摆（timerMs 不走）", frozen2.t === frozen1.t, `t ${frozen1.t}→${frozen2.t}`);
    check("冻结 → anim 停在 jumping（服务端停更，非全松回 idle）", frozen2.fa === "jumping", `anim=${frozen2.fa}`);
    const phase = await roomState(a, `String(s.phase)`);
    check("玩家暂停不占 phase（started 保留；paused=断线专用词）", phase === "started", `phase=${phase}`);
    await a.keyboard.press("p");
    await a.waitForTimeout(500);
    const resumed = JSON.parse(await snapOf(a));
    check("再按 P → fb 恢复推进（暂停期按住的键生效）", resumed.fx - frozen2.fx > 10, `dx=${(resumed.fx - frozen2.fx).toFixed(2)}`);
    check("恢复 → wg 同步推进（全场解除）", resumed.wx - frozen2.wx > 10, `dx=${(resumed.wx - frozen2.wx).toFixed(2)}`);
    check("恢复 → 时钟续走", resumed.t > frozen2.t, `t ${frozen2.t}→${resumed.t}`);
    await a.keyboard.up("ArrowRight");
    await b.keyboard.up("KeyD");
    // H1：PauseMenu 实例 stop→start 复用——第二次暂停必须重新打开，且 requestClose
    // 不被上次残留的 closing=true 吞掉。走完整第二次暂停/恢复，读 Phaser 场景状态。
    await a.waitForFunction(() => !window.__fw.scene.isActive("PauseMenu"), null, { timeout: 4000 }).catch(() => {});
    await a.keyboard.press("p");
    await a.waitForFunction(() => window.__fw.scene.isActive("PauseMenu"), null, { timeout: 4000 }).catch(() => {});
    check("二次暂停 → PauseMenu 重新打开", await a.evaluate(() => window.__fw.scene.isActive("PauseMenu")));
    await a.keyboard.press("p");
    await a.waitForFunction(() => !window.__fw.scene.isActive("PauseMenu"), null, { timeout: 4000 }).catch(() => {});
    check("二次暂停 → 面板可再次关闭（closing 已复位）", !(await a.evaluate(() => window.__fw.scene.isActive("PauseMenu"))));
    await a.screenshot({ path: join(OUT, "pause-a.png") });
    await b.screenshot({ path: join(OUT, "pause-b.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "leave") {
    // ── 场景：主动返回菜单（H3）——room.leave 的服务端关闭码是 4000（WS_CLOSE_CONSENTED），
    // 旧实现只认 1000，会把主动离房当断线：退避重连期间闪出断线横幅、并对已离房间反复重连。
    // 断言：A 回选关树且横幅保持隐藏；B 侧因 consented 释放席位立即回 lobby（H-01 语义）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    await a.evaluate(() => window.__fwLeaveToMenu());
    await a.waitForFunction(() => window.__fw.scene.isActive("Temple"), null, { timeout: 5000 }).catch(() => {});
    // 覆盖旧实现重连退避的前三轮（0/1/2s）：正确实现下横幅应始终 hidden
    await a.waitForTimeout(2300);
    const banner = await a.evaluate(() => {
      const el = document.querySelector("#net-lost");
      return { hidden: el?.classList.contains("hidden") ?? true, text: (el?.textContent ?? "").trim() };
    });
    check("主动离房 → 返回选关树", await a.evaluate(() => window.__fw.scene.isActive("Temple")));
    check("主动离房 → 不出现断线/重连横幅", banner.hidden && banner.text === "", JSON.stringify(banner));
    let bLobby = false;
    try {
      await b.waitForFunction(() => window.__fwInit.net.room.state.phase === "lobby", null, { timeout: 4000 });
      bLobby = true;
    } catch { /* 超时按失败记 */ }
    check("对端主动离房 → 余端回 lobby", bLobby);
    await a.screenshot({ path: join(OUT, "leave-a-menu.png") });
    await b.screenshot({ path: join(OUT, "leave-b-lobby.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "refresh") {
    // ── 场景：刷新回座（H2/M1）——sessionStorage 令牌恢复原席，进入已在 started 的游戏
    // 必须解冻相机（旧实现 init 置 camFrozen=true 后无 ready→started 事件，画面永久冻结）；
    // 回座后服务端换发新令牌，第二次刷新仍能回座（旧实现只存首次 token）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    const resumedGate = `(() => { try {
      return window.__fwInit?.net?.room?.state?.phase === "started" && window.__fw.scene.isActive("Game");
    } catch { return false; } })()`;
    for (const round of [1, 2]) {
      await a.reload({ waitUntil: "domcontentloaded" });
      let resumed = false;
      try {
        await a.waitForFunction(resumedGate, null, { timeout: 20000 });
        resumed = true;
      } catch { /* 超时按失败记 */ }
      check(`第 ${round} 次刷新 → 自动回座 started`, resumed);
      if (!resumed) break;
      if (round === 1) {
        const camFrozen = await a.evaluate(() => window.__fw.scene.getScene("Game").camFrozen);
        check("刷新回座 → 相机已解冻（H2）", camFrozen === false, `camFrozen=${camFrozen}`);
      }
    }
    await a.screenshot({ path: join(OUT, "refresh-a-resumed.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "wonrefresh") {
    // ── 场景：won 相位刷新回座（L-02）——服务端补发 finish 后，客户端必须按权威
    // state.phase 主动补开结算板。旧实现刷新端停在终局画面（EndMenu 未开），
    // 且 lastFinish 已在（0 秒最佳已由服务端修复挡住，但结算 UI 缺失）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    const wonGate = `(() => { try { return window.__fwInit.net.room.state.phase === "won"; } catch { return false; } })()`;
    let won = false;
    try {
      await a.waitForFunction(wonGate, null, { timeout: 15000 });
      won = true;
    } catch { /* 超时按失败记 */ }
    check("FORCE_DOORS 通关（phase=won）", won);
    let endOpen = false;
    try {
      await b.waitForFunction(() => window.__fw.scene.isActive("EndMenu"), null, { timeout: 8000 });
      endOpen = true;
    } catch { /* 超时按失败记 */ }
    check("正常通路 → EndMenu 已开（相位迁移路径不回归）", endOpen);
    const pageErrors = [];
    b.on("pageerror", (e) => pageErrors.push(e.message));
    await b.reload({ waitUntil: "domcontentloaded" });
    let resumed = false;
    try {
      await b.waitForFunction(
        `(() => { try {
          const s = window.__fwInit?.net?.room?.state;
          return s?.phase === "won" && window.__fw.scene.isActive("Game") && window.__fw.scene.isActive("EndMenu");
        } catch { return false; } })()`,
        null,
        { timeout: 25000 },
      );
      resumed = true;
    } catch { /* 超时按失败记 */ }
    check("刷新回座 won → Game 与 EndMenu 均活动", resumed, pageErrors.length ? pageErrors.join("; ") : "");
    const data = await b.evaluate(() => {
      try { return window.__fw.scene.getScene("EndMenu").scene.settings.data; } catch { return null; }
    });
    check(
      "回座结算数据来自关卡/结算消息（钻石总数与限时均非 0）",
      !!data && data.diamondsTotal > 0 && data.timeLimitSec > 0,
      JSON.stringify(data),
    );
    check("刷新回座无页面错误（EndMenu 不在字体未就绪时创建）", pageErrors.length === 0, pageErrors.join("; "));
    let hudOk = false;
    try {
      await b.waitForFunction(
        `(() => document.querySelector("#hud-status")?.textContent === "通关！" && document.querySelector("#hud-top")?.classList.contains("hidden"))()`,
        null,
        { timeout: 3000 },
      );
      hudOk = true;
    } catch { /* 超时按失败记 */ }
    check("won HUD 文案由既有 phase 驱动（通关/隐藏联机栏）", hudOk);
    await b.screenshot({ path: join(OUT, "wonrefresh-b-resumed.png") });
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
  } else if (MODE === "deathretry") {
    // ── 场景 4：死亡静置 Retry（F2 翻转回归）——wg 走进岩浆 → gameover 后必须静置
    // （原版无自动重开；0.3.28 前是 2.5s 自动整关重开），显式 restart 才整关重开。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_02");
    await enterAs(b, PORT, "join", code, "forest_02");
    await waitForStarted(a);
    await waitForStarted(b);
    log(`[deathretry] 房间 ${code} 开局（forest_02：wg 右行 40px 进岩浆）`);
    // B（水女孩）按住 D 走进 row28 岩浆
    await b.keyboard.down("KeyD");
    let over = false;
    for (let i = 0; i < 40; i++) {
      await a.waitForTimeout(250);
      if ((await roomState(a, `String(s.phase)`)) === "gameover") { over = true; break; }
    }
    await b.keyboard.up("KeyD");
    check("wg 入岩浆 → phase=gameover", over);
    const diedAt = Date.now();
    // 静置 3.5s（超过旧自动重开窗 2.5s）断言相位仍是 gameover
    await a.waitForTimeout(3500);
    const still = await roomState(a, `String(s.phase)`);
    check("gameover 静置 3.5s 不自动重开（原版语义）", still === "gameover", `phase=${still}`);
    // 显式 Retry（复用 GameOverMenu「再试一次」同一入口 __fwRestart → restart 消息）
    await a.evaluate(() => window.__fwRestart());
    let restarted = false;
    for (let i = 0; i < 20; i++) {
      await a.waitForTimeout(250);
      if ((await roomState(a, `String(s.phase)`)) === "started") { restarted = true; break; }
    }
    check("Retry → 整关重开 ready→started", restarted, `耗时 ${Date.now() - diedAt}ms（含静置）`);
    const lvl = await roomState(a, `String(s.levelId)`);
    check("重开后关卡不变", lvl === "forest_02", `levelId=${lvl}`);
    await a.screenshot({ path: join(OUT, "deathretry-a.png") });
    await b.screenshot({ path: join(OUT, "deathretry-b.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "rolesplit") {
    // ── 场景 5：按角色分键（F1 翻转回归）——fb 只认方向键，wg 只认 W/A/D，跨组键免疫。
    // 原版证据：bundle @1856520（wg→W/A/D）、@1856587（else fb→UP/LEFT/RIGHT）。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    check("角色分配 A=火人", (await readRole(a)).includes("火人"), await readRole(a));
    check("角色分配 B=水女孩", (await readRole(b)).includes("水女孩"), await readRole(b));
    log(`[rolesplit] 房间 ${code} 开局（forest_01 平地，四段各 400ms 位移观测）`);
    const xOf = (page, role) => roomState(page, `Number(s.players.get("${role}").x)`);
    const fx0 = await xOf(a, "fireboy");
    const wx0 = await xOf(b, "watergirl");
    // 1) fb 忽略 WASD：A 按住 KeyD 400ms，fb.x 必须原地
    await a.keyboard.down("KeyD");
    await a.waitForTimeout(400);
    await a.keyboard.up("KeyD");
    const fx1 = await xOf(a, "fireboy");
    check("fb 忽略 WASD（KeyD 原地）", Math.abs(fx1 - fx0) < 1, `dx=${(fx1 - fx0).toFixed(2)}`);
    // 2) fb 认方向键：A 按住 ArrowRight 400ms，fb.x 右移
    await a.keyboard.down("ArrowRight");
    await a.waitForTimeout(400);
    await a.keyboard.up("ArrowRight");
    const fx2 = await xOf(a, "fireboy");
    check("fb 方向键右移", fx2 - fx1 > 10, `dx=${(fx2 - fx1).toFixed(2)}`);
    // 3) wg 忽略方向键：B 按住 ArrowLeft 400ms，wg.x 必须原地
    await b.keyboard.down("ArrowLeft");
    await b.waitForTimeout(400);
    await b.keyboard.up("ArrowLeft");
    const wx1 = await xOf(b, "watergirl");
    check("wg 忽略方向键（ArrowLeft 原地）", Math.abs(wx1 - wx0) < 1, `dx=${(wx1 - wx0).toFixed(2)}`);
    // 4) wg 认 WASD：B 按住 KeyD 400ms，wg.x 右移
    await b.keyboard.down("KeyD");
    await b.waitForTimeout(400);
    await b.keyboard.up("KeyD");
    const wx2 = await xOf(b, "watergirl");
    check("wg WASD 右移", wx2 - wx1 > 10, `dx=${(wx2 - wx1).toFixed(2)}`);
    await a.screenshot({ path: join(OUT, "rolesplit-a.png") });
    await b.screenshot({ path: join(OUT, "rolesplit-b.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else if (MODE === "backmenu") {
    // ── 场景 6（r43）：开始界面独占四图的交还/重取。
    // 进房时 enterGame 停 Menu → SHUTDOWN 交还四图（5.58MiB）；离房回选关再点左下返回，
    // MenuScene.preload 重取。缺图时 Texture.get 落 __MISSING 只 console.warn，故这里
    // 既查 exists 也比对源图尺寸——只查 exists 会被 __MISSING 骗过。
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const errs = [];
    a.on("pageerror", (e) => errs.push(String(e)));
    const KEYS = ["TempleHall", "Beam", "GameName", "KiziLogo"];
    const EXPECT = { TempleHall: [1366, 768], Beam: [159, 846], GameName: [860, 270], KiziLogo: [319, 144] };
    const texInfo = () =>
      a.evaluate((ks) => {
        const out = {};
        const tm = window.__fw?.textures;
        for (const k of ks) {
          const img = tm && tm.exists(k) ? tm.get(k).source[0]?.image : null;
          out[k] = img && img.width ? [img.width, img.height] : null;
        }
        return out;
      }, KEYS);
    const absent = (info) => KEYS.every((k) => info[k] === null);

    await a.goto(`http://127.0.0.1:${PORT}/?level=forest_01`, { waitUntil: "domcontentloaded" });
    await a.waitForFunction(() => window.__fw?.scene?.isActive("Menu"), null, { timeout: 30000 });
    const first = await texInfo();
    check("首入 Menu 四图在位", JSON.stringify(first) === JSON.stringify(EXPECT), JSON.stringify(first));
    const code = await enterAs(a, PORT, "create", "", "forest_01");
    await enterAs(b, PORT, "join", code, "forest_01");
    await waitForStarted(a);
    await waitForStarted(b);
    await a.waitForFunction(() => window.__fw.scene.isActive("Game"), null, { timeout: 15000 });
    const afterEntry = await texInfo();
    check("进房后四图已交还", absent(afterEntry), JSON.stringify(afterEntry));

    await a.evaluate(() => window.__fwLeaveToMenu());
    await a.waitForFunction(() => window.__fw.scene.isActive("Temple"), null, { timeout: 8000 });
    await a.waitForFunction(() => !window.__fw.scene.isActive("XFade"), null, { timeout: 8000 });
    check("离房回选关后四图仍未重载", absent(await texInfo()));
    // 真实点击左下返回（TempleScene BackButton @ 70,880；#menu 在进房时已 hidden，
    // 幕布不在，点得到画布）。点击后 fadeSwitch 500ms 才起 Menu.preload，故等 Menu active。
    const pt = await a.evaluate(() => {
      const r = document.querySelector("canvas").getBoundingClientRect();
      return { x: r.left + (70 / 1280) * r.width, y: r.top + (880 / 960) * r.height };
    });
    await a.mouse.click(pt.x, pt.y);
    let backOk = false;
    try {
      await a.waitForFunction(() => window.__fw.scene.isActive("Menu"), null, { timeout: 15000 });
      backOk = true;
    } catch { /* 超时按失败记 */ }
    check("返回按钮 → Menu 重进", backOk);
    const back = await texInfo();
    check("重进时四图按原尺寸重取", JSON.stringify(back) === JSON.stringify(EXPECT), JSON.stringify(back));
    check("无页面错误", errs.length === 0, errs.join("; "));
    await a.screenshot({ path: join(OUT, "backmenu-menu.png") });
    results.pass = results.checks.every((c) => c.ok);
    await ctxA.close();
    await ctxB.close();
  } else {
    throw new Error(`未知模式: ${MODE}（可用 journey|pause|leave|refresh|wonrefresh|rejoin|deathretry|rolesplit|backmenu）`);
  }

  await browser.close();
} finally {
  server?.kill();
}
writeFileSync(join(OUT, `journey-${MODE}.json`), JSON.stringify(results, null, 2));
console.log(`[e2e] ${MODE}: ${results.pass ? "ALL PASS" : "FAILED"}（${results.checks.filter((c) => c.ok).length}/${results.checks.length} 项）`);
process.exit(results.pass ? 0 : 1);

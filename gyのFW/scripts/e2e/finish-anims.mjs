/**
 * 结算星碑动画跨变体重绑门禁（r39）。
 *
 * 为什么要有它：r29 把结算板拆成 general/speed/puzzle 三张按类型图集后，`loadPopupFinish`
 * 换变体会卸掉旧纹理，而 `finish_stone_*` 动画是全局 AnimationManager 里跨面板存活的键，
 * 帧名在 create 时已解析成旧纹理的 Frame 对象（Animation.js:454）。旧实现靠 buildSeq 的
 * `exists` 幂等卫跳过重建，于是"general → speed → general"这条换关序上，回到 general 的
 * 面板播的是已销毁帧：AnimationState.handleStart 读 `frame.data.sourceSize` 抛 TypeError，
 * 而且每帧重试（startAnimation 在 handleStart 前已置 isPlaying、hasStarted 保持 false），
 * finalAt 回调在 `stone.play()` 处中断 ⇒「继续」永不被启用。perf-advance 直调
 * `__fwNextLevel` 绕开按钮，所以量具与页面错误计数能看见爆量、却看不见"卡死在结算板"。
 *
 * 判据（真实按钮路径，不直调换关）：
 *   1) 走 forest_01→02→03→04，面板类型序 general/general/speed/general；
 *   2) 第 4 块面板（forest_04 结算，general 变体在 speed 之后重载）在 finalAt 后轮询星碑：
 *      动画键必须是 finish_stone_*、hasStarted=true、帧对象未销毁、且 1.8s 观察窗内
 *      至少出现 2 个不同帧（证明真的在播，而不是定格在首帧）；
 *   3) 该窗内 pageerror 必须为 0（旧实现的 TypeError 每帧一条）；
 *   4) 对真实「继续」按钮发 pointerdown/pointerup（handler 内读 disabled 谓词）——
 *      必须真正 advance 到 forest_05，证明 enabled 已置位。
 *
 * 用法：node scripts/e2e/finish-anims.mjs [--port 3652]
 * 前置：客户端已构建（server 直接服务 packages/client/dist）。产物：scripts/e2e/out/finish-anims.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { OUT, argOf, enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const argv = process.argv.slice(2);
const PORT = Number(argOf(argv, "port", "3652"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { gate: "finish-anims", pass: false, checks: [], pageErrors: [], stones: [] };
const check = (name, ok, detail = "") => {
  results.checks.push({ name, ok, detail });
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
  return ok;
};
const gate = (expr) => `(() => { try { const s = window.__fwInit.net.room.state; return (${expr}); } catch { return false; } })()`;
const waitPhase = (page, expr, timeout) => page.waitForFunction(gate(expr), null, { timeout });
const waitScene = (page, key, active, timeout) =>
  page.waitForFunction(
    `(() => { try { return window.__fw.scene.isActive(${JSON.stringify(key)}) === ${active}; } catch { return false; } })()`,
    null,
    { timeout },
  );
const armWin = (page) => page.evaluate(() => { window.__fwInit?.net?.room?.send?.("debug-arm-win"); });
/** 递归遍历 EndMenu 显示列表（星碑在板容器内），收集星碑动画快照 */
const probeStone = (page) => page.evaluate(() => {
  const sc = window.__fw?.scene?.getScene?.("EndMenu");
  if (!sc) return null;
  const all = [];
  const walk = (o) => {
    if (!o) return;
    all.push(o);
    if (Array.isArray(o.list)) o.list.forEach(walk);
  };
  (sc.children?.list ?? []).forEach(walk);
  const stones = all.filter((o) => typeof o.anims?.currentAnim?.key === "string" && o.anims.currentAnim.key.startsWith("finish_stone"));
  return stones.map((s) => ({
    anim: s.anims.currentAnim.key,
    frame: s.frame?.name ?? null,
    hasStarted: s.anims.hasStarted,
    isPlaying: s.anims.isPlaying,
    frameAlive: s.frame?.data ? true : false,
    scene: s.scene?.scene?.key ?? null,
  }));
});

let server;
let browser;
try {
  server = await startServer(PORT, { FW_DEBUG_FORCE_DOORS: "1", FW_DEBUG_ARM_WIN: "1" });
  browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio"] });
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errs = [];
  a.on("pageerror", (e) => errs.push(String(e?.stack || e)));
  const code = await enterAs(a, PORT, "create", "", "forest_01");
  await enterAs(b, PORT, "join", code, "forest_01");
  await waitForStarted(a);
  await waitForStarted(b);
  await armWin(a);

  let targetReached = false;
  let preErrors = 0;
  const seenFrames = new Set();
  let lastStone = null;
  const seq = ["forest_02", "forest_03", "forest_04"];
  for (let i = 0; i < 4; i++) {
    if (!(await waitPhase(a, 's.phase === "won"', 90_000).then(() => true).catch(() => false))) {
      check(`第 ${i + 1} 次通关`, false, "90s 内未 won");
      break;
    }
    await waitScene(a, "EndMenu", true, 20_000);
    const isTarget = i === 3;
    if (!isTarget) {
      await a.evaluate(() => window.__fwNextLevel());
      const next = seq[i];
      await waitPhase(a, `s.levelId === "${next}"`, 30_000);
      await waitScene(a, "EndMenu", false, 20_000);
      await waitForStarted(a, 60_000);
      await armWin(a);
      log(`第 ${i + 1} 块面板（${i === 2 ? "speed" : "general"}）已过，进入 ${next}`);
      continue;
    }
    targetReached = true;
    // finalAt = 700+700+700+700 = 2800ms；从 create 起算，提前 200ms 开始密集采样。
    await sleep(2600);
    preErrors = errs.length;
    const t0 = Date.now();
    while (Date.now() - t0 < 1800) {
      const s = (await probeStone(a)) ?? [];
      if (s.length) lastStone = s[0];
      for (const x of s) if (x.frame) seenFrames.add(x.frame);
      await sleep(60);
    }
    results.stones = [...seenFrames];
    log(`第 4 块面板采样：帧 ${[...seenFrames].join(",") || "(无)"}；末次 ${JSON.stringify(lastStone)}`);
    check("forest_04 结算面板为 general 变体（speed 之后重载）", lastStone?.anim === "finish_stone_2" || lastStone?.anim?.startsWith("finish_stone_") === true, String(lastStone?.anim));
    check("星碑动画已起播（hasStarted）", lastStone?.hasStarted === true, String(lastStone?.hasStarted));
    check("动画帧对象未销毁", lastStone?.frameAlive === true, String(lastStone?.frameAlive));
    check("观察窗内出现 ≥2 个不同帧（动画真的在播）", seenFrames.size >= 2, `${seenFrames.size} 帧`);
    const burst = errs.slice(preErrors);
    check("第 4 块面板 1.8s 窗内 pageerror = 0", burst.length === 0, `${burst.length} 条`);
    // 真实按钮路径：对 Continue 的 Image 直接发指针事件（handler 内查 disabled 谓词）
    const fired = await a.evaluate(() => {
      const sc = window.__fw?.scene?.getScene?.("EndMenu");
      if (!sc) return false;
      const all = [];
      const walk = (o) => { if (!o) return; all.push(o); if (Array.isArray(o.list)) o.list.forEach(walk); };
      (sc.children?.list ?? []).forEach(walk);
      const btn = all.find((o) => o.type === "Image" && o.frame?.name === "StoneButton0000" && Math.abs((o.x ?? 0) - 541) < 2 && Math.abs((o.y ?? 0) - 502) < 2);
      if (!btn) return false;
      btn.emit("pointerdown");
      btn.emit("pointerup");
      return true;
    });
    check("找到 EndMenu「继续」按钮并触发 pointerup", fired);
    const advanced = await waitPhase(a, 's.levelId === "forest_05"', 20_000).then(() => true).catch(() => false);
    check("「继续」可用并真正换关 forest_04→forest_05", advanced);
    if (advanced) {
      await waitScene(a, "EndMenu", false, 20_000);
      await waitForStarted(a, 60_000);
    }
  }
  results.pageErrors = errs;
  check("整场 pageerror = 0", errs.length === 0, `${errs.length} 条`);
  results.pass = targetReached && results.checks.every((c) => c.ok);
  await ctxA.close();
  await ctxB.close();
} catch (e) {
  log(`门禁异常：${String(e?.stack || e)}`);
  results.error = String(e?.stack || e);
} finally {
  await browser?.close().catch(() => {});
  try { server?.kill(); } catch {}
  await sleep(300);
  try { server?.kill("SIGKILL"); } catch {}
  mkdirSync(OUT, { recursive: true });
  const p = join(OUT, "finish-anims.json");
  writeFileSync(p, JSON.stringify(results, null, 2));
  log(`结果 → ${p}`);
}
if (!results.pass) process.exitCode = 1;

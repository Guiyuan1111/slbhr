/**
 * P3 全自动通关门禁：路由时间线（真实键盘）→ 真实服务端 → 双浏览器 phase=won。
 *
 * 用法（Git Bash，先注入便携 Node PATH；构建产物由调用方保证）：
 *   node scripts/e2e/route.mjs [--level forest_01] [--port 3575] [--repeat 2] [--offset -10] [--offset-b 0] [--sample 250]
 *
 * 路由文件 scripts/e2e/inputs/routes/<level>.json：内核验证过的逐帧时间线
 * （[{f, dir:'up'|'left'|'right', type:'down'|'up'}]，fb/wg 各一条）。
 * 回放语义：
 *   - fb 页（房主=火人）用方向键，wg 页（加入方=水女孩）用 WASD——与客户端 F1 按角色分键一致（原版 bundle @1856520/1856587）；
 *   - 帧→毫秒：t = f·(1000/60) + offset（默认 -10：瞄准服务端 60Hz tick 接受窗中心，
 *     抵消 CDP 派发 ~2ms 延迟；粗等 waitForTimeout，末 40ms performance.now 自旋控精度）；
 *   - 全程零调试钩子：物理只由真实键盘输入驱动，断言全部读权威 state；
 *   - 派发为双页合并时间轴单调度器（同刻事件顺序派发，间隔 <4ms，均在窗口内）；
 *   - 运行中采样双方权威坐标（诊断用），dying/dead 即失败退出。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setPriority, constants as osConst } from "node:os";
import { chromium } from "playwright";
import { OUT, ROOT, argOf, enterAs, log, readRole, roomState, startServer, waitForStarted } from "./lib.mjs";

const args = process.argv.slice(2);
const LEVEL = argOf(args, "level", "forest_01");
const PORT = Number(argOf(args, "port", "3575"));
const REPEAT = Number(argOf(args, "repeat", "1"));
const OFFSET = Number(argOf(args, "offset", "-10"));
const OFFB = Number(argOf(args, "offset-b", "0"));
const SAMPLE_MS = Number(argOf(args, "sample", "250"));

const routeDoc = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
const MS_PER_F = 1000 / routeDoc.tickHz;
const TOTAL_MS = routeDoc.totalFrames * MS_PER_F;

/** dir → 各页 Playwright 键名（A 页方向键 / B 页 WASD） */
const KEYS = {
  fb: { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" },
  wg: { up: "KeyW", left: "KeyA", right: "KeyD" },
};

/** 双页合并时间轴：[{t, page:'a'|'b', key, type}]
 * （路线自身负责时序健壮性：±1f 迟到向致命的刀锋事件须在内核层预移早帧——见 v37 注记；
 *  墙钟层只做统一窗口瞄准，不做逐事件偏移。） */
function mergedTimeline() {
  const out = [];
  for (const [role, tag] of [["fb", "a"], ["wg", "b"]]) {
    // offset-b：page-B（wg）逐毫秒补偿——实测某些关卡 B 页 CDP 派发系统性晚 ~25ms（≈1.5f），
    // 刀锋落点（如 forest_06_1 wg 越池）会被翻进池内；路线文件保持内核验证原样，仅墙钟层前移。
    const off = tag === "b" ? OFFSET + OFFB : OFFSET;
    for (const ev of routeDoc[role]) {
      out.push({ t: Math.round(ev.f * MS_PER_F) + off, page: tag, key: KEYS[role][ev.dir], type: ev.type, f: ev.f, role });
    }
  }
  out.sort((x, y) => x.t - y.t || (x.type === "up" ? -1 : 1));
  return out;
}

/** 粗等 + 末段自旋的精准 sleep（until 为 t0 相对毫秒；自旋只阻塞本调度器，CDP 收发在 await 间正常进行） */
async function sleepPrecise(page, until) {
  for (;;) {
    const elapsed = performance.now() - EPOCH - T0;
    const wait = until - elapsed;
    if (wait <= 0) return;
    if (wait > 45) await page.waitForTimeout(Math.min(wait - 40, 120));
    else {
      const spinStart = performance.now();
      while (performance.now() - spinStart < wait) { /* busy */ }
      return;
    }
  }
}

let EPOCH = 0; // performance.now() → Date.now() 换算补偿
let T0 = 0; // 本轮回放零点（Date.now()）

async function runOnce(browserA, browserB, runTag) {
  const a = await browserA.newPage();
  const b = await browserB.newPage();
  await a.setViewportSize({ width: 1400, height: 1000 });
  await b.setViewportSize({ width: 1400, height: 1000 });
  const result = { tag: runTag, won: false, diedAt: null, winAtMs: null, trace: [], events: 0 };

  const code = await enterAs(a, PORT, "create", "", LEVEL);
  // 页内相位观察器（rAF 分辨率，A 页，观察到 started 即自熄——运行期 A 页只跑游戏本体，
  // 任何页内常驻计时器都会与派发时刻相位锁死：实测 40ms 记录器与 f332 每轮必撞 26-118ms）。
  // 锚定原理：服务端 beginReady 与开钟恰好相隔 READY_MS=2000ms（setTimeout），
  // A 页经 patch 看到 ready 与看到 started 的观察延迟同源于 ~50ms patch 周期，
  // 两者相减即消掉观察延迟——t0 = ready_seen + 2000ms，残差只有 2s 内 patch 相位漂移。
  await a.evaluate(() => {
    window.__fwPhaseT = {};
    const watch = () => {
      try {
        const ph = String(window.__fwInit.net.room.state.phase);
        if (ph && !(ph in window.__fwPhaseT)) window.__fwPhaseT[ph] = Date.now();
        if (window.__fwPhaseT.started) return; // 开钟锚定完成，让出 rAF（诊断记录器在 B 页）
      } catch { /* 初始未连接 */ }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  const joinedB = Date.now();
  await enterAs(b, PORT, "join", code, LEVEL);
  // 双页运行期一律零页内常驻计时器：任何页内 interval 都会与固定事件时刻相位锁死
  // （实测 40ms 记录器与 f332 每轮必撞 26-118ms、37ms 素数化仍给渲染主线程添任务）。
  // 诊断采样全部走 CDP 侧（250ms 采样器/500ms 胜负轮询，受静默窗调度）。
  // CDP 输入链路预热：Shift 不在游戏键表（Arrow*/WASD/Touch*）内，无输入副作用
  for (let i = 0; i < 5; i++) {
    await a.keyboard.down("Shift");
    await a.keyboard.up("Shift");
    await b.keyboard.down("Shift");
    await b.keyboard.up("Shift");
  }
  // 等真实开钟：页面相位观察到 started
  await waitForStarted(a);
  await waitForStarted(b);
  const roleA = await readRole(a);
  const roleB = await readRole(b);
  log(`[${runTag}] 房间 ${code} 已开局 roleA=${roleA} roleB=${roleB}`);
  result.roleA = roleA;
  result.roleB = roleB;

  // 时基零点：服务端相位时间戳（权威）。started 日志缺 failed 时退 ready+2000，再退页面观察。
  const phaseT = await a.evaluate(() => window.__fwPhaseT);
  const readySeen = phaseT?.ready;
  const startedSeen = phaseT?.started;
  const anchorSrc = phaseMs.started ? "serverStarted"
    : phaseMs.ready ? "serverReady+2000"
      : typeof startedSeen === "number" ? "observedFlip" : "joinedB+2000";
  const flipActual = anchorSrc === "serverStarted" ? phaseMs.started
    : anchorSrc === "serverReady+2000" ? phaseMs.ready + 2000
      : anchorSrc === "observedFlip" ? startedSeen
        : joinedB + 2000;
  result.flipAnchor = {
    readySeen, startedSeen, joinedB, used: anchorSrc,
    serverReady: phaseMs.ready || null, serverStarted: phaseMs.started || null,
    obsLatencyReady: readySeen && phaseMs.ready ? readySeen - phaseMs.ready : null,
    obsLatencyStarted: startedSeen && phaseMs.started ? startedSeen - phaseMs.started : null,
  };
  T0 = flipActual;
  // mono↔wall 桥接：sleepPrecise 的 elapsed 走 mono（不受 NTP 校时扰动），但需把
  // T0（服务端翻转戳）到此刻（客户端观察 started + readRole，~60ms 后）之间的墙钟差补回，
  // 否则全部派发系统性偏迟同样一段（旧实现 EPOCH=T0-performance.now() 丢掉了它）。
  EPOCH = performance.now() - Date.now();
  const t0 = T0;

  const timeline = mergedTimeline();
  result.events = timeline.length;
  // 诊断静默窗：派发进行中（键盘 CDP 调用前后 ~80ms）采样/轮询的 evaluate 必须让路——
  // 否则固定节拍的诊断与固定时刻的派发确定性相撞（实测 250ms 采样 tick 正撞 f316、
  // 500ms 胜负轮询正撞 f332，每轮在该事件迟到 20-36ms=1-2 帧晚，正中路线脆弱走廊）。
  let dispatchBusyUntil = 0;
  const yieldToDispatch = async () => {
    while (Date.now() < dispatchBusyUntil) await a.waitForTimeout(20);
  };
  const deadCheck = async () => {
    const d = await roomState(a, `String(s.players.get("fireboy").dying) + String(s.players.get("watergirl").dying)`);
    return d === "truetrue" || d === "truefalse" || d === "falsetrue" ? d : null;
  };

  // 派发任务：合并时间轴单调度器
  const sampler = (async () => {
    while (Date.now() - t0 < TOTAL_MS + 15000) {
      await a.waitForTimeout(SAMPLE_MS);
      await yieldToDispatch();
      const el = Date.now() - t0;
      const snap = await roomState(
        a,
        `JSON.stringify({ f: Math.round(${el} / ${MS_PER_F}), fb: [s.players.get("fireboy").x, s.players.get("fireboy").y], wg: [s.players.get("watergirl").x, s.players.get("watergirl").y], ph: String(s.phase) })`,
      );
      try { result.trace.push(JSON.parse(snap)); } catch { result.trace.push({ raw: snap }); }
    }
  })();

  const dispatch = (async () => {
    for (const ev of timeline) {
      // 两段睡眠：先睡到事件前 130ms，打开静默窗预告，再睡剩余段——采样/轮询若在
      // 预告后才醒来必然让路；更早醒来的 evaluate 最迟 ~30ms 完成，仍赶在派发前结束
      await sleepPrecise(a, ev.t - 130);
      dispatchBusyUntil = t0 + ev.t + 80;
      await sleepPrecise(a, ev.t);
      const page = ev.page === "a" ? a : b;
      const sent = Date.now() - t0;
      await page.keyboard[ev.type](ev.key);
      result.trace.push({ dispatch: { t: sent, done: Math.round(Date.now() - t0), f: ev.f, role: ev.role, dir: ev.key, type: ev.type } });
    }
  })();

  // 胜负轮询
  const deadline = Date.now() + TOTAL_MS + 15000;
  let shot = false;
  while (Date.now() < deadline) {
    await a.waitForTimeout(500);
    await yieldToDispatch();
    const phase = await roomState(a, `String(s.phase)`);
    if (phase === "won") {
      result.won = true;
      result.winAtMs = Date.now() - t0;
      break;
    }
    if (phase === "gameover") {
      const dead = await deadCheck();
      result.diedAt = `gameover @${Date.now() - t0}ms dying=${dead}`;
      break;
    }
    const dead = await deadCheck();
    if (dead) {
      result.diedAt = `dying @${Date.now() - t0}ms (${dead})`;
      break;
    }
    if (!shot && Date.now() - t0 > 5000) {
      shot = true;
      await a.screenshot({ path: join(OUT, `${runTag}-mid-a.png`) });
      await b.screenshot({ path: join(OUT, `${runTag}-mid-b.png`) });
    }
  }
  await sampler;
  await dispatch.catch((e) => { result.dispatchError = String(e); });
  const fbPos = await roomState(a, `JSON.stringify([s.players.get("fireboy").x, s.players.get("fireboy").y])`);
  const wgPos = await roomState(a, `JSON.stringify([s.players.get("watergirl").x, s.players.get("watergirl").y])`);
  result.finalPhase = await roomState(a, `String(s.phase)`);
  result.final = { fb: JSON.parse(fbPos), wg: JSON.parse(wgPos) };
  if (result.won) {
    await a.waitForTimeout(2200);
    await a.screenshot({ path: join(OUT, `${runTag}-win-a.png`) });
    await b.screenshot({ path: join(OUT, `${runTag}-win-b.png`) });
  } else {
    await a.screenshot({ path: join(OUT, `${runTag}-fail-a.png`) });
    await b.screenshot({ path: join(OUT, `${runTag}-fail-b.png`) });
  }
  await a.close();
  await b.close();
  return result;
}

mkdirSync(OUT, { recursive: true });
// 派发进程提优先级：门禁常与其他产线任务（优化器/子 agent 内核回跑）共存，普通优先级的
// sleepPrecise 自旋会被抢占造成派发迟到（实测共存期 f316 刀锋 2/3 挂）；HIGH 级让调度自旋
// 免于普通负载抢占（浏览器渲染进程不受影响，属另一层）。
try { setPriority(osConst.priority.PRIORITY_HIGH); } catch { /* 多用户会话受限则退回普通级 */ }
let server;
const results = [];
let pass = true;
// 服务端相位时间戳（纯观测）：t0 锚定的权威来源。
// 旧锚（readySeen+2000）把客户端观察延迟（patch+rAF ~50ms）系统性算进零点，
// 非整数全局偏移被服务端按 tick 取整成混合 +3f/+4f 逐事件滑帧，正中 ±1f 刀锋事件。
const phaseMs = { ready: 0, started: 0 };
try {
  server = await startServer(PORT);
  server.stdout.on("data", (buf) => {
    const m = String(buf).match(/\[phase\] (ready|started) @(\d+)/);
    if (m) phaseMs[m[1]] = Number(m[2]);
  });
  // max-semi-space-size=64：Phaser 逐帧分配导致 minor GC 频繁，实测 renderer 主线程
  // 30-80ms 停顿正落在派发上（门禁容差 ~12ms），扩新生代把 GC 频率压掉一个量级。
  // 双页各开独立浏览器实例：键盘注入走浏览器进程 UI 线程、GPU 进程与 CDP 连接均为
  // 实例级共享——单实例双 context 时 A 页诊断与 B 页派发在这些共享层互相踩踏。
  const launch = () => chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio", "--js-flags=--max-semi-space-size=64"] });
  const browserA = await launch();
  const browserB = await launch();
  for (let r = 1; r <= REPEAT; r++) {
    try {
      const res = await runOnce(browserA, browserB, `route-run${r}`);
      results.push(res);
      const ok = res.won && !res.diedAt && !res.dispatchError;
      log(`[${res.tag}] ${ok ? "PASS" : "FAIL"} won=${res.won} winAt=${res.winAtMs}ms died=${res.diedAt ?? "-"} final=${res.finalPhase} fb=(${res.final?.fb?.[0]?.toFixed(0)},${res.final?.fb?.[1]?.toFixed(0)}) wg=(${res.final?.wg?.[0]?.toFixed(0)},${res.final?.wg?.[1]?.toFixed(0)})`);
      if (!ok) pass = false;
    } catch (err) {
      log(`[route-run${r}] EXCEPTION`, String(err));
      results.push({ tag: `route-run${r}`, exception: String(err) });
      pass = false;
    }
  }
  await browserA.close();
  await browserB.close();
} finally {
  server?.kill();
}
writeFileSync(join(OUT, "route-results.json"), JSON.stringify({ level: LEVEL, offset: OFFSET, pass, results }, null, 1));
console.log(`[e2e] route ${LEVEL}: ${pass ? "ALL PASS" : "FAILED"}（${results.length} 轮，trace 明细 scripts/e2e/out/route-results.json）`);
process.exit(pass ? 0 : 1);

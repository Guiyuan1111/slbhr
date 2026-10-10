/**
 * P3 全自动通关门禁：路由时间线（真实键盘）→ 真实服务端 → 双浏览器 phase=won。
 *
 * 用法（Git Bash，先注入便携 Node PATH；构建产物由调用方保证）：
 *   node scripts/e2e/route.mjs [--level forest_01] [--port 3575] [--repeat 2] [--offset -10] [--sample 250]
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
import { chromium } from "playwright";
import { OUT, ROOT, argOf, enterAs, log, readRole, roomState, startServer, waitForStarted } from "./lib.mjs";

const args = process.argv.slice(2);
const LEVEL = argOf(args, "level", "forest_01");
const PORT = Number(argOf(args, "port", "3575"));
const REPEAT = Number(argOf(args, "repeat", "1"));
const OFFSET = Number(argOf(args, "offset", "-10"));
const SAMPLE_MS = Number(argOf(args, "sample", "250"));

const routeDoc = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
const MS_PER_F = 1000 / routeDoc.tickHz;
const TOTAL_MS = routeDoc.totalFrames * MS_PER_F;

/** dir → 各页 Playwright 键名（A 页方向键 / B 页 WASD） */
const KEYS = {
  fb: { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" },
  wg: { up: "KeyW", left: "KeyA", right: "KeyD" },
};

/** 双页合并时间轴：[{t, page:'a'|'b', key, type}] */
function mergedTimeline() {
  const out = [];
  for (const [role, tag] of [["fb", "a"], ["wg", "b"]]) {
    for (const ev of routeDoc[role]) {
      out.push({ t: Math.round(ev.f * MS_PER_F) + OFFSET, page: tag, key: KEYS[role][ev.dir], type: ev.type, f: ev.f, role });
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

async function runOnce(browser, runTag) {
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const result = { tag: runTag, won: false, diedAt: null, winAtMs: null, trace: [], events: 0 };

  const code = await enterAs(a, PORT, "create", "", LEVEL);
  // 页内相位观察器（rAF 分辨率）+ 高频记录器（40ms）：只读权威 state，零行为干预。
  // 锚定原理：服务端 beginReady 与开钟恰好相隔 READY_MS=2000ms（setTimeout），
  // A 页经 patch 看到 ready 与看到 started 的观察延迟同源于 ~50ms patch 周期，
  // 两者相减即消掉观察延迟——t0 = ready_seen + 2000ms，残差只有 2s 内 patch 相位漂移。
  await a.evaluate(() => {
    window.__fwPhaseT = {};
    window.__rec = [];
    const watch = () => {
      try {
        const ph = String(window.__fwInit.net.room.state.phase);
        if (ph && !(ph in window.__fwPhaseT)) window.__fwPhaseT[ph] = Date.now();
      } catch { /* 初始未连接 */ }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    window.__recTimer = window.setInterval(() => {
      try {
        const s = window.__fwInit.net.room.state;
        window.__rec.push({
          t: Date.now(),
          ph: String(s.phase),
          fb: [s.players.get("fireboy")?.x, s.players.get("fireboy")?.y],
          wg: [s.players.get("watergirl")?.x, s.players.get("watergirl")?.y],
        });
      } catch { /* ready 前状态未就绪 */ }
    }, 40);
  });
  const joinedB = Date.now();
  await enterAs(b, PORT, "join", code, LEVEL);
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
  const deadCheck = async () => {
    const d = await roomState(a, `String(s.players.get("fireboy").dying) + String(s.players.get("watergirl").dying)`);
    return d === "truetrue" || d === "truefalse" || d === "falsetrue" ? d : null;
  };

  // 派发任务：合并时间轴单调度器
  const sampler = (async () => {
    while (Date.now() - t0 < TOTAL_MS + 15000) {
      await a.waitForTimeout(SAMPLE_MS);
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
  await ctxA.close();
  await ctxB.close();
  return result;
}

mkdirSync(OUT, { recursive: true });
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
  // 30-80ms 停顿正落在派发上（门禁容差 ~12ms），扩新生代把 GC 频率压掉一个量级
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--js-flags=--max-semi-space-size=64"] });
  for (let r = 1; r <= REPEAT; r++) {
    try {
      const res = await runOnce(browser, `route-run${r}`);
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
  await browser.close();
} finally {
  server?.kill();
}
writeFileSync(join(OUT, "route-results.json"), JSON.stringify({ level: LEVEL, offset: OFFSET, pass, results }, null, 1));
console.log(`[e2e] route ${LEVEL}: ${pass ? "ALL PASS" : "FAILED"}（${results.length} 轮，trace 明细 scripts/e2e/out/route-results.json）`);
process.exit(pass ? 0 : 1);

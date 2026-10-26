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
/** 文档键名 → 页内虚拟键：KeyboardInput.setVirtual 同源注入（MERGED_KEYSETS 每页按角色映射） */
const TOUCH_OF = { ArrowUp: "TouchUp", KeyW: "TouchUp", ArrowLeft: "TouchLeft", KeyA: "TouchLeft", ArrowRight: "TouchRight", KeyD: "TouchRight" };

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
  await a.setViewportSize({ width: 800, height: 600 });
  await b.setViewportSize({ width: 800, height: 600 });
  // rAF 停发：Phaser 软渲染每帧霸占主线程 10-20ms，CDP 按键事件排队在帧后，keydown→ws
  // 消息系统性迟到（200ms 节流后仍有 −10…+29ms 全谱抖动、65 事件越 deadline 滑帧——渲染
  // 爆发撞击不可避免）。输入/会话关键路径全部与 rAF 无关：输入发送在自建 window 键监听
  // （input.ts 事件即发+15Hz 兜底）、onPhase/setPaused 走 onStateChange ws 回调、进房
  // enterGame 为 DOM+fetch 链、状态镜像由 colyseus onStateChange 维护；画面与场景更新
  // 无断言、胜负全在服务端——rAF 直接不回调，主线程对按键零争用。
  const rafThrottle = `window.requestAnimationFrame = () => 0;`;
  await a.addInitScript({ content: rafThrottle });
  await b.addInitScript({ content: rafThrottle });
  const result = { tag: runTag, won: false, diedAt: null, winAtMs: null, trace: [], events: 0 };

  const code = await enterAs(a, PORT, "create", "", LEVEL);
  const joinedB = Date.now();
  await enterAs(b, PORT, "join", code, LEVEL);
  // setVirtual 注入口就绪：__fwInit 在 enterGame 尾部暴露（键盘实例此前已建）
  await a.waitForFunction(() => Boolean(window.__fwInit?.keyboard), null, { timeout: 15000 });
  await b.waitForFunction(() => Boolean(window.__fwInit?.keyboard), null, { timeout: 15000 });
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
  // 等 ready 锚（服务端 stdout）：开钟与 ready 恰隔 READY_MS=2000ms（服务端 setTimeout），
  // t0 = ready+2000 先行锚定、派发循环即刻武装（首个事件由 sleepPrecise 等满剩余窗）——
  // 旧流程 waitForStarted(页内 patch ~50ms 滞后) + readRole/phaseT 等页内查询把派发循环
  // 拖到 started 后 ~60-110ms，首批事件（t<空隙）全部过期即发，且其中先于客户端本地
  // started 处理的键直接被客户端丢弃（实测 light_02 fb f2 起跳整键丢失、路线 cascading 脱轨）。
  // 路线自身仍须保证首个事件 ≥ 开钟后 ~150ms（客户端 started 网络滞后窗口），见各路线文件。
  for (;;) {
    if (phaseMs.ready || phaseMs.started) break;
    await a.waitForTimeout(10);
  }
  // 锚定恒取 ready+2000（服务端开钟 = ready 的 setTimeout(2000)，确定性未来点）。
  // 不得用 phaseMs.started：浏览器预热 >2s 时它已成过去时，派发循环从过期时刻起跑，
  // 首批事件爆发性迟到 20-75ms（实测 f11-47 全体 +3-4.5f，直接打脱角色开局链）。
  const anchorSrc = "serverReady+2000";
  const flipActual = phaseMs.ready + 2000;
  result.flipAnchor = {
    joinedB, used: anchorSrc,
    serverReady: phaseMs.ready || null, serverStarted: phaseMs.started || null,
  };
  T0 = flipActual;
  // mono↔wall 桥接：sleepPrecise 的 elapsed 走 mono（不受 NTP 校时扰动）。
  EPOCH = performance.now() - Date.now();
  const t0 = T0;

  const timeline = mergedTimeline();
  result.events = timeline.length;

  // 诊断延后集：角色确认/页面相位观察都属诊断，不阻派发（页内常驻观察器仍照旧自熄）。
  const diag = (async () => {
    const waitStarted = () => new Promise((res) => {
      const watch = () => {
        try { if (String(window.__fwInit.net.room.state.phase) === "started") return res(); } catch { /* 初始未连接 */ }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    // 页内相位观察器（rAF 分辨率）：仅作 started 观察延迟测量，不再承担锚定
    await a.evaluate(() => {
      window.__fwPhaseT = {};
      const watch = () => {
        try {
          const ph = String(window.__fwInit.net.room.state.phase);
          if (ph && !(ph in window.__fwPhaseT)) window.__fwPhaseT[ph] = Date.now();
          if (window.__fwPhaseT.started) return;
        } catch { /* 初始未连接 */ }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    const roleA = await readRole(a);
    const roleB = await readRole(b);
    result.roleA = roleA;
    result.roleB = roleB;
    log(`[${runTag}] 房间 ${code} 已开局 roleA=${roleA} roleB=${roleB}`);
    await waitStarted();
    const phaseT = await a.evaluate(() => window.__fwPhaseT);
    result.flipAnchor.readySeen = phaseT?.ready ?? null;
    result.flipAnchor.startedSeen = phaseT?.started ?? null;
    result.flipAnchor.obsLatencyReady = result.flipAnchor.readySeen && result.flipAnchor.serverReady ? result.flipAnchor.readySeen - result.flipAnchor.serverReady : null;
    result.flipAnchor.obsLatencyStarted = result.flipAnchor.startedSeen && result.flipAnchor.serverStarted ? result.flipAnchor.startedSeen - result.flipAnchor.serverStarted : null;
  })();
  diag.catch(() => {});
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
    if (SAMPLE_MS <= 0) return; // 0 = 彻底关闭（服务端 FW_DUMP 已提供零污染真相）
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

  // 页内 worker 调度器模式：CDP evaluate 往返 fwd 段实测 p50=28ms/±25（run8 页内自计时
  // 全谱）——对 16.7ms 帧窗不可用；页主线程 setTimeout 链也被 Chromium 定时器策略推迟
  // （裸测 17ms 实发 p50 41-52ms，空白页则完美 17.5ms，与补丁率无关）。 DedicatedWorker
  // 有独立事件循环、定时器不受该策略管束（裸测 17ms 实发 p50≈21.7 含 postMessage 回主
  // 线程一跳）——时间线注入 worker，按 worker 页钟触发，postMessage 回主线程执行
  // setVirtual（触屏同源路径，pressed 集/15Hz 重发/暂停闸语义与真键全同）。
  // 锚定：同机时钟直映射——页/worker Date.now() 与 node 墙钟同源（差 0-1ms），
  // T0 = 开钟预估 ready+2000（墙）− 页墙↔perf 桥；服务器 setTimeout(2000) 实测漂移 +5ms。
  const dispatch = (async () => {
    const stage = (pg, list, t0Wall) => pg.evaluate((evs) => new Promise((resolve) => {
      const pageEpochWall = Date.now() - performance.now();
      const T0 = evs.t0Wall - pageEpochWall;
      const kb = window.__fwInit.keyboard;
      const workerSrc = `
        onmessage = (m) => {
          const { t0Wall, items } = m.data;
          const epoch = Date.now() - performance.now();
          const T0 = t0Wall - epoch;
          const q = items.slice().sort((a, b) => a.t - b.t);
          const step = () => {
            const now = performance.now() - T0;
            const batch = [];
            while (q.length && q[0].t <= now) batch.push(q.shift());
            if (batch.length) postMessage({ batch });
            if (q.length) setTimeout(step, Math.max(0, q[0].t - (performance.now() - T0)));
            else postMessage({ done: true });
          };
          setTimeout(step, Math.max(0, q[0].t - (performance.now() - T0)));
        };
      `;
      const w = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" })));
      const fired = [];
      let done = false;
      const finish = (why) => { if (!done) { done = true; try { w.terminate(); } catch {} resolve({ why, fired, t0PagePerf: T0, pageEpochWall }); } };
      w.onmessage = (m) => {
        if (m.data.done) { finish("drained"); return; }
        for (const e of m.data.batch) {
          kb.setVirtual(e.c, e.d);
          fired.push({ f: e.f, key: e.k, at: Math.round(performance.now() - T0) });
        }
      };
      w.onerror = (e) => finish("worker-error:" + (e.message ?? "?"));
      w.postMessage({ t0Wall: evs.t0Wall, items: evs.items });
      setTimeout(() => finish("timeout"), 150000);
    }), { t0Wall, items: list });
    const toPage = (role) => routeDoc[role].map((e) => ({
      t: Math.round(e.f * MS_PER_F) + OFFSET,
      c: TOUCH_OF[KEYS[role][e.dir]],
      d: e.type === "down",
      f: e.f,
      k: KEYS[role][e.dir],
    }));
    const runs = await Promise.all([stage(a, toPage("fb"), flipActual), stage(b, toPage("wg"), flipActual)]);
    console.log(`[e2e] 页内调度: fb=${runs[0].why}(${runs[0].fired.length}) wg=${runs[1].why}(${runs[1].fired.length})`);
    for (const [i, role] of ["fb", "wg"].entries()) {
      const firedAt = new Map(runs[i].fired.map((x) => [x.f + "|" + x.key, x.at]));
      for (const e of routeDoc[role]) {
        result.trace.push({
          dispatch: {
            t: Math.round(e.f * MS_PER_F) + OFFSET,
            exec: firedAt.get(e.f + "|" + KEYS[role][e.dir]) ?? -1,
            done: -1, f: e.f, role, dir: KEYS[role][e.dir], type: e.type,
          },
        });
      }
      console.log(`[e2e] 页内锚: ${role} t0PagePerf=${Math.round(runs[i].t0PagePerf)} pageEpochWall=${Math.round(runs[i].pageEpochWall)}`);
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
// 每轮独立服务器+浏览器实例（跨轮累积修复）：单进程 repeat3 时 run2 起受前轮残留干扰——
// Ubuntu 实测三种 offset 组合下 run2 均系统性翻车，独立进程×3（各自新服务器+新浏览器）
// 对照 3/3 全 PASS 坐实。Windows 机同构复用未暴露此效应，系本机（VM 2.5GHz/软件渲染）
// 实时性弱、累积被放大；代价是每轮 +2 次浏览器启动（~4s）。
let phaseMs = { ready: 0, started: 0 };
for (let r = 1; r <= REPEAT; r++) {
  phaseMs = { ready: 0, started: 0 };
  server = await startServer(PORT);
  server.stdout.on("data", (buf) => {
    const m = String(buf).match(/\[phase\] (ready|started) @(\d+)/);
    if (m) phaseMs[m[1]] = Number(m[2]);
  });
  // max-semi-space-size=64：Phaser 逐帧分配导致 minor GC 频繁，实测 renderer 主线程
  // 30-80ms 停顿正落在派发上（门禁容差 ~12ms），扩新生代把 GC 频率压掉一个量级。
  // 双页各开独立浏览器实例：键盘注入走浏览器进程 UI 线程、GPU 进程与 CDP 连接均为
  // 实例级共享——单实例双 context 时 A 页诊断与 B 页派发在这些共享层互相踩踏。
  // Linux 加 --disable-webgl：VM 无硬件 GL（vmwgfx EGL 链路不通），WebGL 落 SwiftShader
  // 软件渲染把 rAF 拖到 ~33fps，客户端输入采样节拍与 60Hz tick 失配必翻车；Canvas 满帧 60。
  const launch = () => chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio", "--js-flags=--max-semi-space-size=64", ...(process.platform === "linux" ? ["--disable-webgl"] : [])] });
  const browserA = await launch();
  const browserB = await launch();
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
  } finally {
    await browserA.close().catch(() => {});
    await browserB.close().catch(() => {});
    server?.kill();
    server = null;
  }
}
writeFileSync(join(OUT, "route-results.json"), JSON.stringify({ level: LEVEL, offset: OFFSET, pass, results }, null, 1));
console.log(`[e2e] route ${LEVEL}: ${pass ? "ALL PASS" : "FAILED"}（${results.length} 轮，trace 明细 scripts/e2e/out/route-results.json）`);
process.exit(pass ? 0 : 1);

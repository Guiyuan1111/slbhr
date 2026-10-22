/**
 * 换关链基准（r13）：结算「继续」→ 下一关可玩的分段计时。
 *
 * 面向用户可感的换关卡顿（advance 链，0.3.12 起活房间换关 + 0.3.37 黑幕包络）。
 * 与 r8 perf-scene（点击创建→Game）互补：那条链有大厅暖装兜底，这条链**没有任何预热**——
 * 每次换关现拉关卡 JSON + 现烘焙地面（5 张整关尺寸 canvas + 高斯模糊 + 12 次描边叠加）
 * + 现向 GPU 传纹理。审计 #5 记过该成本（重开重进整段重付 ≈20.8MB 像素缓冲），
 * 但一直只有单次估算，没有分段实跑数字——本工具补上。
 *
 * 口径（页内 performance.now()，零产品代码侵入，全部走运行时包装）：
 *   - callAt      ：`window.__fwNextLevel`（EndMenu「继续」按钮 handler 本体）被调用的时刻。
 *   - advanceSent ：`net.advance` 实例属性包装（Shadowing 原型方法，调用点 `net.advance(id)` 命中）。
 *   - fetchStart/fetchEnd：`window.fetch` 包装，仅匹配 /api/level/（prefetch 命中缓存时**无请求**，
 *                           此两字段为空即"网络段归零"的判据）。
 *   - bakeStart/bakeMs：`GameScene.prototype.buildGround` 包装（esbuild 不改类成员名，
 *                       私有 TS 方法在运行时仍是 `buildGround`）。这是本工具的**主指标**：
 *                       缓存未命中=整幅烘焙，命中=仅 addCanvas 上传。
 *   - sceneStarted：Game 场景从 inactive→active 的首个 postrender（fadeSwitch 之后 create 完成）。
 *   - firstRender ：sceneStarted 之后的首个 postrender（可玩帧）。
 *   - worstFrame ：callAt→归档区间内最大 prestep→postrender 跨度（帧内阻塞）。
 *   - worstGap   ：同区间最大**帧间隔**（上一帧 postrender→本帧 postrender）。两者必须并记：
 *                  关卡构建跑在 create 的 await 之后，烘焙属帧间任务，落在帧内窗外——
 *                  首版只量帧内得到 2-11ms 的"无害帧"，实际表现为掉帧（间隔 >130ms）。
 *   黑幕包络（FadeScene 500ms×2）是设计延迟，不计入工作项；故同时给
 *   「链墙钟」(callAt→firstRender) 与「工作量」(fetch+bake+sceneStarted 段) 两类数字。
 *
 * 流程：FW_DEBUG_FORCE_DOORS=1 + FW_DEBUG_ARM_WIN=1 加速通关 → won → 结算窗静网+dwell →
 * 测一次 advance → 新关可玩帧后重新武装 → 自动再 won → 循环 N 次（f01→f02→…，逐关不同尺寸，
 * 天然覆盖多种关卡）。武装式判胜（r36）保证服务端 won 严格落在可玩帧之后：旧钩子 started
 * 即判胜，弱网下新关还在下载就已经 won，下一关预取在链内起跳、结算窗与链窗重叠，读数不可归因。
 *
 * 用法：
 *   node benchmark/perf-advance.mjs [--runs 5] [--dwell 1200] [--port 3566] [--net off|4g|fast3g|slow3g]
 *                                   [--level forest_01] --save <label>
 *   node benchmark/perf-advance.mjs --dwell 120 --compare <label>   # 120=模拟"秒点继续"
 *   --level 指定起点（r36，例：--level forest_24_1 --runs 2 让链跨进 bonus 关，把
 *   房内字体 roombase→blank 的 795.7KB 大翻转拉进链窗；缺省 forest_01 = 原口径）。
 * 产物：benchmark/results/advance-<label>.json
 *
 * r36：补两笔拆账——①链内**逐条资源**（PerformanceResourceTiming：URL/传输字节/耗时/相对
 * callAt 的落点），换关链不再是黑盒"剩余 ≈45ms"，而是能看出哪份文件在谁脸上；②换关落定后的
 * **纹理驻留**（`textures.list` 的 w·h·4 总账 + 大图集逐键），用于回答换关是否留下旧变体。
 * 网络档位口径照抄 perf-load 的隧道表（CDP `Network.emulateNetworkConditions`），只施加在
 * 驱动端 A 页；等待超时按档位放大。
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const RUNS = Number(argOf("runs", "5"));
const PORT = Number(argOf("port", "3566"));
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "adv-pw";
const START_LEVEL = argOf("level", "forest_01");
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
/** 隧道节流（r36）：与 benchmark/perf-load.mjs 同一张表（Lighthouse 定义）。
 *  只施加在驱动端 A 页——B 是第二客户端、不参与链上耗时；给 A 加就够了。 */
const NET_PROFILES = {
  off: { latency: 0, down: -1, up: -1, waitScale: 1 },
  cable: { latency: 30, down: 1_250_000, up: 312_500, waitScale: 8 },
  "4g": { latency: 80, down: 500_000, up: 125_000, waitScale: 24 },
  fast3g: { latency: 150, down: 200_000, up: 93_750, waitScale: 60 },
  slow3g: { latency: 400, down: 62_500, up: 62_500, waitScale: 200 },
};
const NET_NAME = argOf("net", "off");
if (!Object.hasOwn(NET_PROFILES, NET_NAME)) {
  throw new Error(`--net 档位未知：${NET_NAME}（可用：${Object.keys(NET_PROFILES).join("/")}）`);
}
const NET = NET_PROFILES[NET_NAME];
const W = (ms) => Math.round(ms * NET.waitScale);
/** 档位放大但封顶：长等必须能在可解释的时间内失败。 */
const T = (ms, cap) => Math.min(W(ms), cap);
const log = (...a) => console.log("[advance]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0", FW_DEBUG_FORCE_DOORS: "1", FW_DEBUG_ARM_WIN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 30000);
    const echo = process.env.ADV_SERVER_LOG === "1";
    const ondata = (buf) => {
      const s = String(buf);
      // 弱网长等排障：服务端 [phase] 行能直接把「客户端没收到」与「服务端没开钟」切开
      if (echo) for (const line of s.split("\n")) if (line.trim()) log("[srv]", line.trim());
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用（--port 换口）")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

async function enterAs(page, mode, roomCode) {
  log(`${mode}：载入首页（${START_LEVEL}）…`);
  await page.goto(`${BASE}/?level=${START_LEVEL}`, { waitUntil: "domcontentloaded" });
  log(`${mode}：${mode === "create" ? "建房" : "加入"}…`);
  await page.fill("#password", PASSWORD);
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  const ok = await pollExpr(
    page,
    `(() => /房间码 [^（\\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""))()`,
    T(25000, 180_000),
    `${mode} 进房`,
  );
  if (!ok) {
    // #menu-error 兼作状态行（建房时也会写"连接中…"），只作超时后的诊断提示
    const hint = (await page.textContent("#menu-error").catch(() => ""))?.trim();
    throw new Error(`${mode} 进房超时${hint ? `（提示：${hint}）` : ""}`);
  }
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}

/** 轮询任意页内表达式（r36）：`waitForFunction` 在弱网长等里是黑盒，卡在"没进房/没 won"
 *  时日志一片空白。本函数每 20s 打一次心跳，超时上限由调用方用 T() 钉死——绝不随档位
 *  放大到小时级（slow3g 的 W(60000) 是 200 分钟，失败与"还在跑"无法区分）。 */
async function pollExpr(page, expression, timeoutMs, tag) {
  const t0 = Date.now();
  let last = 0;
  for (;;) {
    const v = await page.evaluate(expression).catch(() => false);
    if (v) return v;
    if (Date.now() - last > 20000) {
      last = Date.now();
      log(`等待 ${tag}… ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    if (Date.now() - t0 >= timeoutMs) return false;
    await sleep(500);
  }
}

/** 相位轮询：表达式跑在 `net.room.state` 作用域里 */
const pollPhase = (page, expr, timeoutMs, tag) => pollExpr(page, stateGate(expr), timeoutMs, tag);

/** 页内探针：全部运行时包装，装好一次后每次 advance 自动记一条 __adv */
const PROBE = `(() => {
  const W = window;
  W.__adv = null;
  W.__advLog = [];
  // 相位/连接采样（r36）：弱网长等里「phase 迟迟不到 started」要先分清是 WS 掉线
  // （state 代理冻在旧值）还是别的——只记变化点，500ms 一次，开销可忽略。
  W.__phaseLog = [];
  setInterval(() => {
    try {
      const room = W.__fwInit?.net?.room;
      const phase = String(room?.state?.phase ?? "");
      const open = room?.connection?.isOpen !== false;
      const last = W.__phaseLog[W.__phaseLog.length - 1];
      if (!last || last.phase !== phase || last.open !== open) {
        W.__phaseLog.push({ t: +performance.now().toFixed(0), phase, open });
        if (W.__phaseLog.length > 200) W.__phaseLog.shift();
      }
    } catch { /* 房间未建好 */ }
  }, 500);
  const mark = (k, v) => { if (W.__adv) W.__adv[k] = v ?? performance.now(); };
  const bump = (k) => { if (W.__adv) W.__adv[k] = (W.__adv[k] || 0) + 1; };
  const of = W.fetch;
  W.fetch = async function (...a) {
    const isLevel = /\\/api\\/level\\//.test(String(a[0]));
    const owner = isLevel ? W.__adv : null; // 只把"同一记录内发起"的请求计入本链：
    // 预取的响应可能在下一次点「继续」之后才回，若按全局 mark 会把上一窗的尾流
    // 记成"链内网络段"（实测出现 fetchEnd 有、fetchStart 无的孤儿）。
    if (isLevel && owner) { mark("fetchStart"); owner.fetchCount = (owner.fetchCount || 0) + 1; }
    const r = await of.apply(this, a);
    if (isLevel && owner && W.__adv === owner) mark("fetchEnd");
    return r;
  };
  const install = () => {
    const g = W.__fw;
    if (!g?.events || !g.scene) { setTimeout(install, 80); return; }
    // buildGround 计时（esbuild 保留类成员名）
    const scene = g.scene.getScene("Game");
    const proto = scene && Object.getPrototypeOf(scene);
    if (proto && typeof proto.buildGround === "function" && !proto.__advWrapped) {
      const o = proto.buildGround;
      proto.buildGround = function (...a) {
        mark("bakeStart");
        bump("bakeCount");
        const t0 = performance.now();
        const r = o.apply(this, a);
        mark("bakeMs", performance.now() - t0);
        return r;
      };
      proto.__advWrapped = true;
    }
    // net.advance 计时（实例属性 shadow 原型方法）
    const net = W.__fwInit?.net;
    if (net && !net.__advWrapped) {
      const o = net.advance.bind(net);
      net.advance = function (id) {
        mark("advanceSent"); bump("advanceCount");
        if (W.__adv) W.__adv.targetLevel = String(id);
        return o(id);
      };
      net.__advWrapped = true;
    }
    // 帧/生命周期（仅注册一次；单处理器内先累计峰值再判归档，
    // 否则烘焙重帧会被"归档即置 null"吞掉——首版探针的实测勘误）
    if (!W.__advEvents && g.events.on) {
      W.__advEvents = true;
      W.__hitches = []; // 全程掉帧流水（帧间隔 >80ms 的 {t,gap}，页内时钟）：预烘把烘焙
      // 挪进结算空闲窗，那一段不在换关链窗内——没有这条流水就只能看到"链内没变好"，
      // 无法诚实回答"这笔开销现在砸在谁脸上"。
      const HITCH_MS = 80;
      let lastStep = performance.now();
      let lastRender = performance.now();
      g.events.on("prestep", () => { lastStep = performance.now(); });
      g.events.on("postrender", () => {
        const now = performance.now();
        const gap = now - lastRender;
        lastRender = now;
        if (gap > HITCH_MS) {
          W.__hitches.push({ t: +now.toFixed(1), gap: +gap.toFixed(1) });
          if (W.__hitches.length > 400) W.__hitches.shift();
        }
        const A = W.__adv;
        if (!A) return;
        if (A.callAt !== undefined) {
          const d = now - lastStep;
          if (d > (A.worstFrame || 0)) A.worstFrame = d;
          // 帧间隔（上一帧 postrender→本帧 postrender）：换关烘焙跑在 create 的 await
          // 之后，属**帧间任务**，落在 prestep→postrender 窗外——只量帧内耗时会把它
          // 记成 2-11ms 的"无害帧"，实际表现为掉帧（间隔 130ms+）。故双口径并记，
          // 并按"起场前/起场后"分桶定位阻塞落在哪一段。
          if (gap > (A.worstGap || 0)) A.worstGap = gap;
          if (A.sceneStarted === undefined) {
            if (gap > (A.gapBuild || 0)) A.gapBuild = gap;
          } else if (gap > (A.gapAfter || 0)) A.gapAfter = gap;
        }
        const active = g.scene.isActive("Game");
        if (!A.sawInactive && active === false) { A.sawInactive = true; mark("sceneStopped"); }
        else if (A.sawInactive && A.sceneStarted === undefined && active === true) mark("sceneStarted");
        else if (A.sceneStarted !== undefined && A.firstRender === undefined) mark("firstRender");
        // firstRender 之后再留 2 帧观察余量（重帧可能落在起场首帧之后）
        else if (A.firstRender !== undefined && ++A.tail >= 2) { W.__advLog.push(A); W.__adv = null; }
      });
    }
    // 「继续」按钮 handler 本体：shadow 全局，标记一次新运行
    if (typeof W.__fwNextLevel === "function" && !W.__fwNextLevel.__advWrapped) {
      const o = W.__fwNextLevel;
      W.__fwNextLevel = function (...a) { W.__adv = { tail: 0, callAt: undefined }; mark("callAt"); const r = o.apply(this, a); return r; };
      W.__fwNextLevel.__advWrapped = true;
    }
    if (W.__advEvents && W.__fwNextLevel?.__advWrapped) W.__advInstalled = true;
    setTimeout(install, 200); // 各钩子的到位时机不同（__fw / 原型 / net 实例 / 全局 handler），持续幂等补齐
  };
  install();
})()`;

const stateGate = (expr) => `(() => { try { const s = window.__fwInit.net.room.state; return (${expr}); } catch { return false; } })()`;
/** 结算窗静网门（r36 量具）：won 之后等到"在飞 HTTP=0 且 quietMs 内无新完成"再点继续。
 *  否则弱网上一关的曲/图集尾流还在下载，链内读数被上一窗污染（首版 slow3g 基线里
 *  MenuMusic:150KB 就落在链内）——预热的效果也就无从归因。WS 长连接不计入在飞。 */
let netInflight = 0;
let netLastAt = Date.now();
const netDone = () => { netInflight = Math.max(0, netInflight - 1); netLastAt = Date.now(); };
const trackNet = (page) => {
  page.on("request", (r) => {
    if (r.resourceType() === "websocket") return;
    netInflight += 1; netLastAt = Date.now();
  });
  page.on("requestfinished", (r) => { if (r.resourceType() !== "websocket") netDone(); });
  page.on("requestfailed", (r) => { if (r.resourceType() !== "websocket") netDone(); });
};
async function waitNetIdle(quietMs, timeoutMs, tag, minWaitMs = 0) {
  const t0 = Date.now();
  let last = 0;
  for (;;) {
    const quiet = Date.now() - netLastAt;
    // minWait：won 后预热要先等 level JSON 一个 RTT 才起跳（slow3g 400ms），
    // 没这个观察窗时首个 250ms 轮询会读到"链尾已静默 1.2s"而提前放行。
    if (Date.now() - t0 >= minWaitMs && netInflight === 0 && quiet >= quietMs) return true;
    if (Date.now() - last > 20000) {
      last = Date.now();
      log(`等待 ${tag}… ${Math.round((Date.now() - t0) / 1000)}s（在飞 ${netInflight}，静默 ${(quiet / 1000).toFixed(1)}s）`);
    }
    if (Date.now() - t0 >= timeoutMs) return false;
    await sleep(250);
  }
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? +s[Math.floor(s.length / 2)].toFixed(1) : null; };
const mean = (xs) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null;

const server = await startServer();
let result = null;
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
  args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctxA.addInitScript(PROBE);
  const a = await ctxA.newPage();
  trackNet(a);
  const b = await ctxB.newPage();
  if (NET_NAME !== "off") {
    const cdp = await ctxA.newCDPSession(a);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: NET.latency, downloadThroughput: NET.down, uploadThroughput: NET.up,
    });
    log(`节流：${NET_NAME}（${NET.latency}ms · ${NET.down}B/s↓）只施加在 A 页`);
  }
  const errs = [];
  a.on("pageerror", (e) => errs.push(String(e)));
  const code = await enterAs(a, "create", "");
  await enterAs(b, "join", code);
  if (!(await pollPhase(a, `s.phase === "started"`, T(30000, 120_000), "首关起场"))) {
    throw new Error("首关未起场（120s 上限）");
  }
  if (!(await pollExpr(a, `window.__advInstalled === true`, T(10000, 30_000), "探针安装"))) {
    throw new Error("探针未装好（__advInstalled，30s 上限）");
  }
  // r36 量具：服务端开门改为"武装后生效"（FW_DEBUG_ARM_WIN）。首关起场即武装；
  // 之后每次换关都在**本次可玩帧之后**才武装，让「服务端判胜」严格落在链窗之后——
  // 旧钩子 started 即开门，弱网下新关客户端还没加载完就已经 won，下一关预取在链内起跳。
  const armWin = () => a.evaluate(() => { window.__fwInit?.net?.room?.send?.("debug-arm-win"); });
  await armWin();

  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    if (!(await pollPhase(a, `s.phase === "won"`, T(60000, 150_000), `第 ${i + 1} 次 won`))) {
      log(`第 ${i + 1} 次：等待 won 超时（150s 上限），终止`);
      break;
    }
    // 结算窗起点（r36）：won 之后到点「继续」之间的资源由"链内"改记"结算窗"。
    const wonAtRaw = await a.evaluate(() => performance.now());
    // 结算窗静网门（r36）：等上一关尾流（曲/图集）跑完再点继续，链内读数才只含本链字节。
    const idleT0 = Date.now();
    // minWait 2500：won 后预热要先等 level JSON 一个 RTT 才起跳（slow3g 400ms 起），
    // 没有观察窗时首个 250ms 轮询会读到"上一关尾流已静默 1.2s"而抢跑。
    const idleOk = await waitNetIdle(1200, T(3000, 90_000), `第 ${i + 1} 次结算窗静网`, 2500);
    const idleMs = Date.now() - idleT0;
    if (!idleOk) log(`第 ${i + 1} 次：结算窗 ${Math.round(idleMs / 1000)}s 仍未静网（上限），按当前尾流继续`);
    await sleep(Number(argOf("dwell", "1200"))); // 结算面板停留：EndMenu 开板 + 星碑落定后再点
    // 「继续」。缺省 1200ms（>预取 500ms 起跳 + 一次烘焙 66ms），对应实玩"看一眼结算再点"；
    // 调小即模拟"秒点"，此时预取尚未起跳、链内退化为现烘——两种停留都要各跑一遍才叫公平对比。
    const before = await a.evaluate(() => window.__fwInit.net.room.state.levelId);
    const len0 = await a.evaluate(() => window.__advLog.length);
    // 仅驱动 A 端「继续」（B 端同调会在过渡窗内用滞后的 currentTempleEntry 算出
    // 重复/过期 nextId，被服务端 `id === levelId` 丢弃后真正的换关来自 B 的第二发，
    // 记录归属即错乱——首版实测勘误）。
    await a.evaluate(() => window.__fwNextLevel());
    // 等**本次**记录入档（长度增长，而非"最后一条有 firstRender"——后者会读到上一轮的旧条）
    let rec = null;
    for (let t = 0; t < 300; t++) {
      rec = await a.evaluate((n) => (window.__advLog.length > n ? window.__advLog[window.__advLog.length - 1] : null), len0);
      if (rec) break;
      await sleep(100);
    }
    const after = await a.evaluate(() => window.__fwInit.net.room.state.levelId);
    if (!rec || rec.firstRender === undefined) { log(`第 ${i + 1} 次：未采到完整链，跳过`); continue; }
    const seg = (k) => rec[k] !== undefined && rec.callAt !== undefined ? +(rec[k] - rec.callAt).toFixed(1) : null;
    // 换关落定后的纹理驻留（r36）：口径同 perf-resident（w·h·4），只列 ≥0.5MiB 的键，
    // 用来确认旧字体键已卸、mech 只留本关变体、Finish/Core 的保留是否符合设计。
    const tex = await a.evaluate(() => {
      const list = window.__fw.textures.list;
      let total = 0; const big = [];
      for (const k of Object.keys(list)) {
        const src = list[k]?.source?.[0];
        if (!src || !src.width) continue;
        const b = src.width * src.height * 4;
        total += b;
        if (b >= 524288) big.push([k, +(b / 1048576).toFixed(2)]);
      }
      big.sort((x, y) => y[1] - x[1]);
      return { totalMB: +(total / 1048576).toFixed(2), big };
    });
    runs.push({
      from: before, to: after, target: rec.targetLevel,
      bakeMs: rec.bakeMs !== undefined ? +rec.bakeMs.toFixed(1) : null,
      bakeCount: rec.bakeCount ?? 0, fetchCount: rec.fetchCount ?? 0, advanceCount: rec.advanceCount ?? 0,
      fetchMs: rec.fetchEnd !== undefined && rec.fetchStart !== undefined ? +(rec.fetchEnd - rec.fetchStart).toFixed(1) : (rec.fetchEnd === undefined && rec.fetchStart === undefined ? 0 : null),
      advanceToFetch: seg("fetchStart"), sceneStopped: seg("sceneStopped"), sceneStarted: seg("sceneStarted"),
      firstRenderMs: +(rec.firstRender - rec.callAt).toFixed(1),
      bakeToStart: rec.sceneStarted !== undefined && rec.bakeStart !== undefined ? +(rec.sceneStarted - rec.bakeStart).toFixed(1) : null,
      worstFrameMs: rec.worstFrame !== undefined ? +rec.worstFrame.toFixed(1) : null,
      worstGapMs: rec.worstGap !== undefined ? +rec.worstGap.toFixed(1) : null,
      gapBuildMs: rec.gapBuild !== undefined ? +rec.gapBuild.toFixed(1) : null,
      gapAfterMs: rec.gapAfter !== undefined ? +rec.gapAfter.toFixed(1) : null,
      callAtRaw: +rec.callAt.toFixed(1),
      wonAtRaw: +wonAtRaw.toFixed(1),
      winToCallMs: +(rec.callAt - wonAtRaw).toFixed(1),
      idleMs,
      bakeStartRaw: rec.bakeStart !== undefined ? +rec.bakeStart.toFixed(1) : null,
      tex,
    });
    log(`#${i + 1} ${before}→${after} 目标=${rec.targetLevel} 烘焙=${runs[i]?.bakeMs}ms×${runs[i]?.bakeCount} 网络=${runs[i]?.fetchMs}ms×${runs[i]?.fetchCount} advance=${runs[i]?.advanceCount} 换关→可玩=${runs[i]?.firstRenderMs}ms 峰帧=${runs[i]?.worstFrameMs}ms 峰隔=${runs[i]?.worstGapMs}ms 驻留=${tex.totalMB}MB 结算窗=${runs[i]?.winToCallMs}ms(静网 ${idleMs}ms)`);
    // 下一关已可玩（firstRender 已归档）→ 武装自动开门，让服务端判胜落在链窗之后
    await armWin();
  }
  // 链内资源账（r36）：resource 条目是**完成时**才入表，慢链上 chars-play 等可能晚于归档——
  // 逐轮当场取会漏，故在全部跑完后按 startTime 归窗（每轮窗口 = callAt→firstRender+1500ms）。
  const allRes = await a.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => ({
      u: e.name.replace(/^https?:\/\/[^/]+/, ""),
      s: +e.startTime.toFixed(1),
      d: Math.round(e.duration),
      ts: e.transferSize ?? -1,
      eb: e.encodedBodySize ?? -1,
    })),
  );
  // 三段归窗（r36 件2）：链内 = 点继续→建场开始（preload 批次）；建场后 = 建场开始后
  // 1500ms（音乐/结算板；它们常早于首帧发起，按首帧切会把非阻塞笔误记成链内）。
  // 结算窗 = won→点继续（预热若生效，字节必须落在这里而不是链内）。
  for (const r of runs) {
    const tChain0 = r.callAtRaw - 50, tChain1 = r.bakeStartRaw ?? r.callAtRaw + r.firstRenderMs, tPost1 = r.callAtRaw + r.firstRenderMs + 1500;
    r.res = allRes
      .filter((e) => e.s >= tChain0 && e.s <= tPost1)
      .sort((x, y) => x.s - y.s)
      .map((e) => ({ ...e, s: +(e.s - r.callAtRaw).toFixed(0), w: e.s < tChain1 ? "chain" : "post" }));
    const kb = (xs) => +(xs.reduce((s, e) => s + Math.max(0, e.ts), 0) / 1024).toFixed(1);
    r.resKB = kb(r.res);
    r.chainKB = kb(r.res.filter((e) => e.w === "chain"));
    r.postKB = kb(r.res.filter((e) => e.w === "post"));
    const tWarm0 = r.wonAtRaw - 1000, tWarm1 = tChain0;
    r.settle = allRes
      .filter((e) => e.s >= tWarm0 && e.s <= tWarm1)
      .sort((x, y) => x.s - y.s)
      .map((e) => ({ ...e, s: +(e.s - r.wonAtRaw).toFixed(0) }));
    r.settleKB = kb(r.settle);
  }
  const brief = (xs, max = 4) =>
    xs.filter((e) => e.ts > 1024).slice(0, max)
      .map((e) => `${e.u.split("/").pop()}:${(e.ts / 1024).toFixed(0)}KB@${e.s}ms`).join(" ");
  for (const [i, r] of runs.entries()) {
    const cut = r.bakeStartRaw !== null ? Math.round(r.bakeStartRaw - r.callAtRaw) : r.firstRenderMs;
    log(`#${i + 1} 链内(→${cut}ms) ${r.chainKB}KB ${brief(r.res.filter((e) => e.w === "chain"))}`);
    log(`#${i + 1} 结算窗 ${r.settleKB}KB ${brief(r.settle)}  ·  建场后 ${r.postKB}KB ${brief(r.res.filter((e) => e.w === "post"))}`);
  }
  // 掉帧流水必须在关上下文之前取（首版把它写在 close 之后 → page.evaluate 直接炸）
  const hitchRaw = await a.evaluate(() => (typeof window.__hitches === "object" ? window.__hitches : []));
  const phaseLog = await a.evaluate(() => window.__phaseLog ?? []).catch(() => []);
  await ctxA.close();
  await ctxB.close();

  const key = (k) => runs.map((r) => r[k]).filter((v) => typeof v === "number");
  // 掉帧归位：链窗（callAt→可玩帧+2 帧余量）内的算"玩家点继续后被卡"，
  // 其余（含 won 空闲窗里的预烘/GC）算"结算面板背后的卡"——两者用户可感知度不同，
  // 必须分开报，否则把开销挪个窝会被读成"没优化"。
  const windows = runs.map((r) => [r.callAtRaw, r.callAtRaw + r.firstRenderMs + 120]);
  const hitches = hitchRaw.map((h) => {
    const i = windows.findIndex((w) => h.t >= w[0] && h.t <= w[1]);
    return { t: h.t, gap: h.gap, phase: i >= 0 ? `chain#${i + 1}` : "idle" };
  });
  const inChain = hitches.filter((h) => h.phase !== "idle");
  const idle = hitches.filter((h) => h.phase === "idle");
  result = {
    meta: {
      label: argSave || "adhoc", runs: runs.length, git: (() => { try { return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { return "?"; } })(),
      date: new Date().toISOString(), node: process.version, forceDoors: true, net: NET_NAME,
      startLevel: START_LEVEL, dwellMs: Number(argOf("dwell", "1200")),
      note: "FW_DEBUG_FORCE_DOORS+ARM_WIN：可玩帧后才判胜；__fwNextLevel 直调=「继续」按钮本体；结算窗=won→点继续（静网 1.2s 后起算 dwell）；黑幕包络(500ms×2)计入墙钟不计入工作量",
    },
    runs,
    phaseLog,
    summary: {
      bakeMsMean: mean(key("bakeMs")), bakeMsMedian: median(key("bakeMs")),
      fetchMsMean: mean(key("fetchMs")),
      firstRenderMsMean: mean(key("firstRenderMs")), firstRenderMsMedian: median(key("firstRenderMs")),
      sceneStartedMsMean: mean(key("sceneStarted")),
      worstFrameMsMean: mean(key("worstFrameMs")), worstFrameMsMax: key("worstFrameMs").length ? Math.max(...key("worstFrameMs")) : null,
      worstGapMsMean: mean(key("worstGapMs")), worstGapMsMax: key("worstGapMs").length ? Math.max(...key("worstGapMs")) : null,
      gapBuildMsMean: mean(key("gapBuildMs")), gapAfterMsMean: mean(key("gapAfterMs")),
      bakeCountTotal: key("bakeCount").reduce((a, b) => a + b, 0),
      zeroNetworkRuns: key("fetchMs").filter((v) => v === 0).length,
      hitchChain: inChain.length,
      hitchChainMsMax: inChain.length ? Math.max(...inChain.map((h) => h.gap)) : 0,
      hitchIdle: idle.length,
      hitchIdleMsMax: idle.length ? Math.max(...idle.map((h) => h.gap)) : 0,
      resKBMean: mean(key("resKB")),
      chainKBMean: mean(key("chainKB")),
      settleKBMean: mean(key("settleKB")),
      postKBMean: mean(key("postKB")),
      resReqMean: mean(runs.map((r) => r.res?.length ?? 0)),
      texMBMean: mean(runs.map((r) => r.tex?.totalMB).filter((v) => typeof v === "number")),
    },
    // 资源聚合（r36）：只列单次传输 ≥1KB 的 URL；hits 逐轮记阶段（chain/post/settle），
    // 便于看"这笔字节从谁脸上挪到了谁脸上"。
    assets: (() => {
      const m = new Map();
      const add = (e, i, w) => {
        if (e.ts <= 1024) return;
        const cur = m.get(e.u) ?? { url: e.u, hits: [] };
        cur.hits.push({ run: i + 1, w, kb: +(e.ts / 1024).toFixed(1) });
        m.set(e.u, cur);
      };
      runs.forEach((r, i) => {
        for (const e of r.res ?? []) add(e, i, e.w);
        for (const e of r.settle ?? []) add(e, i, "settle");
      });
      return [...m.values()].sort((x, y) => Math.max(...y.hits.map((h) => h.kb)) - Math.max(...x.hits.map((h) => h.kb)));
    })(),
    hitches,
    pageErrors: errs,
  };
  const s = result.summary;
  log(`汇总：烘焙均值 ${s.bakeMsMean}ms  网络均值 ${s.fetchMsMean}ms  换关→可玩均值 ${s.firstRenderMsMean}ms  峰隔均值 ${s.worstGapMsMean}ms(最大 ${s.worstGapMsMax})  零网络次数 ${s.zeroNetworkRuns}/${runs.length}`);
  log(`资源三段：链内均值 ${s.chainKBMean}KB  结算窗均值 ${s.settleKBMean}KB  建场后均值 ${s.postKBMean}KB（窗内含建场后，合计 ${s.resKBMean}KB/${s.resReqMean} 条）  驻留均值 ${s.texMBMean}MB  [档位 ${NET_NAME}]`);
  log(`掉帧归位：链内(点继续后) ${s.hitchChain} 次/峰 ${s.hitchChainMsMax}ms  空闲(含结算窗预烘) ${s.hitchIdle} 次/峰 ${s.hitchIdleMsMax}ms`);
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400);
  try { server.kill("SIGKILL"); } catch {}
}

if (argSave && result) {
  if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });
  const p = join(RESULTS, `advance-${argSave}.json`);
  writeFileSync(p, JSON.stringify(result, null, 2));
  log("已存档 →", p.split("/").slice(-1)[0]);
}
if (argCompare && result) {
  const p = join(RESULTS, `advance-${argCompare}.json`);
  if (!existsSync(p)) { log("无对比快照:", p); process.exit(0); }
  const prev = JSON.parse(readFileSync(p, "utf8"));
  const rows = [
    ["bakeMsMean", "烘焙均值 ms"], ["fetchMsMean", "网络均值 ms"],
    ["sceneStartedMsMean", "→create 完成 ms"], ["firstRenderMsMean", "→可玩帧 ms"],
    ["worstFrameMsMean", "峰帧均值 ms"], ["worstGapMsMean", "峰隔均值 ms"], ["worstGapMsMax", "峰隔最大 ms"],
    ["gapBuildMsMean", "起场前峰隔 ms"], ["gapAfterMsMean", "起场后峰隔 ms"],
    ["hitchChain", "链内掉帧次数"], ["hitchChainMsMax", "链内掉帧峰 ms"],
    ["hitchIdle", "空闲掉帧次数"], ["hitchIdleMsMax", "空闲掉帧峰 ms"],
    ["chainKBMean", "链内字节均值 KB"], ["settleKBMean", "结算窗字节均值 KB"],
    ["postKBMean", "建场后字节均值 KB"], ["texMBMean", "纹理驻留均值 MB"],
  ];
  console.log("\n=== 换关链前后对比 ===");
  console.log("  指标                      前 →      后      Δ");
  for (const [k, name] of rows) {
    const b = prev.summary?.[k], n = result.summary?.[k];
    if (typeof b !== "number" || typeof n !== "number") { console.log(`  ${name.padEnd(22)}  -`); continue; }
    const d = b !== 0 ? (((n - b) / b) * 100).toFixed(1) + "%" : "n/a";
    console.log(`  ${name.padEnd(22)} ${String(b).padStart(7)} → ${String(n).padStart(7)}  ${d}`);
  }
  console.log(`  零网络换关次数            ${prev.summary?.zeroNetworkRuns ?? "-"} → ${result.summary?.zeroNetworkRuns}`);
  console.log(`  烘焙总次数(buildGround)   ${prev.summary?.bakeCountTotal ?? "-"} → ${result.summary?.bakeCountTotal}`);
}

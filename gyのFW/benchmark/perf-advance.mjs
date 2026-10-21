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
 * 流程：FW_DEBUG_FORCE_DOORS=1 加速通关 → won → 测一次 advance → 新关 started → 自动再 won →
 * 循环 N 次（f01→f02→…，逐关不同尺寸，天然覆盖多种关卡）。
 *
 * 用法：
 *   node benchmark/perf-advance.mjs [--runs 5] [--dwell 1200] [--port 3566] --save <label>
 *   node benchmark/perf-advance.mjs --dwell 120 --compare <label>   # 120=模拟"秒点继续"
 * 产物：benchmark/results/advance-<label>.json
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
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
const log = (...a) => console.log("[advance]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0", FW_DEBUG_FORCE_DOORS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 30000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用（--port 换口）")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

async function enterAs(page, mode, roomCode) {
  await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", PASSWORD);
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 20000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 25000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}

/** 页内探针：全部运行时包装，装好一次后每次 advance 自动记一条 __adv */
const PROBE = `(() => {
  const W = window;
  W.__adv = null;
  W.__advLog = [];
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
  const b = await ctxB.newPage();
  const errs = [];
  a.on("pageerror", (e) => errs.push(String(e)));
  const code = await enterAs(a, "create", "");
  await enterAs(b, "join", code);
  await a.waitForFunction(stateGate(`s.phase === "started"`), null, { timeout: 30000 });
  await a.waitForFunction(() => window.__advInstalled === true, null, { timeout: 10000 });

  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    try { await a.waitForFunction(stateGate(`s.phase === "won"`), null, { timeout: 60000 }); }
    catch { log(`第 ${i + 1} 次：等待 won 超时，终止`); break; }
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
    });
    log(`#${i + 1} ${before}→${after} 目标=${rec.targetLevel} 烘焙=${runs[i]?.bakeMs}ms×${runs[i]?.bakeCount} 网络=${runs[i]?.fetchMs}ms×${runs[i]?.fetchCount} advance=${runs[i]?.advanceCount} 换关→可玩=${runs[i]?.firstRenderMs}ms 峰帧=${runs[i]?.worstFrameMs}ms 峰隔=${runs[i]?.worstGapMs}ms`);
    await a.waitForFunction(stateGate(`s.phase === "started"`), null, { timeout: 30000 }).catch(() => {});
  }
  // 掉帧流水必须在关上下文之前取（首版把它写在 close 之后 → page.evaluate 直接炸）
  const hitchRaw = await a.evaluate(() => (typeof window.__hitches === "object" ? window.__hitches : []));
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
      date: new Date().toISOString(), node: process.version, forceDoors: true,
      note: "FW_DEBUG_FORCE_DOORS 加速 won；__fwNextLevel 直调=「继续」按钮本体；黑幕包络(500ms×2)计入墙钟不计入工作量",
    },
    runs,
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
    },
    hitches,
    pageErrors: errs,
  };
  const s = result.summary;
  log(`汇总：烘焙均值 ${s.bakeMsMean}ms  网络均值 ${s.fetchMsMean}ms  换关→可玩均值 ${s.firstRenderMsMean}ms  峰隔均值 ${s.worstGapMsMean}ms(最大 ${s.worstGapMsMax})  零网络次数 ${s.zeroNetworkRuns}/${runs.length}`);
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

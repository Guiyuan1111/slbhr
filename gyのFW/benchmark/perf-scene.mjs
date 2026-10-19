/**
 * 场景切换链基准（r8）：点击「创建」→ GameScene 激活的分段计时。
 *
 * 面向用户可感延迟（r5 后冷启 Menu 已收 32%，剩余大头=点击→Game ~409ms 暖装态）。
 * 里程碑（页内 performance.now()，2ms 轮询粒度）：
 *   click → matchmakeEnd（/matchmake fetch 应答）→ levelEnd（/api/level + 图块集
 *   全落）→ templeEnd（temple.json，若在关键路径）→ menuHidden（#menu 加 hidden，
 *   即 enterGame 全部 await 完成并切场景）→ gameActive（GameScene isActive，
 *   create 完成后置位）。
 * 页内探针（addInitScript，零产品代码侵入）：
 *   - fetch 包装：逐请求起止打点（含 matchmake/api/temple/tilesets）；
 *   - PerformanceObserver resource：点击窗口内仍在飞的网络资源（暖装尾巴可见）；
 *   - MutationObserver #menu class → menuHidden；2ms 轮询 __fw.scene.isActive('Game')。
 *
 * 用法：
 *   node --import tsx benchmark/perf-scene.mjs [--no-build] [--runs 5] --save <label>
 *   node --import tsx benchmark/perf-scene.mjs --no-build --compare <label>
 *   node --import tsx benchmark/perf-scene.mjs --no-build --prof          # 末轮附 CDP CPU 剖析
 * 产物：benchmark/results/scene-<label>.json（--prof 时另存 TEMP/scene-prof.cpuprofile）
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = 3562;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "scene-pw";
const LEVEL = "forest_01";

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const argProf = process.argv.includes("--prof");
const RUNS = Number(process.argv.includes("--runs") ? process.argv[process.argv.indexOf("--runs") + 1] : 5);
const NO_BUILD = process.argv.includes("--no-build");
/** 冷路径口径：Menu active 后立即点击（不等暖装落定）——邀请深链/极速建房档 */
const COLD = process.argv.includes("--cold");
const log = (...a) => console.log("[scene]", ...a);

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/** 页内探针：fetch 打点 + #menu MutationObserver + Game active 2ms 轮询。
 *  全部写入 window.__fwM = [{name, t, ...}]，跑完一次性收割。 */
const INIT_HOOK = () => {
  const install = () => {
    const M = (globalThis.__fwM = []);
    const now = () => performance.now();
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      const t0 = now();
      try {
        return await origFetch(input, init);
      } finally {
        M.push({ name: "fetch", url, start: t0, end: now() });
      }
    };
    const menu = document.getElementById("menu");
    if (menu) {
      new MutationObserver(() => {
        if (menu.classList.contains("hidden") && !M.some((m) => m.name === "menuHidden")) {
          M.push({ name: "menuHidden", t: now() });
        }
      }).observe(menu, { attributes: true, attributeFilter: ["class"] });
    }
    // Game 激活轮询：探针启动后常驻（重进场景也能抓到）
    const poll = () => {
      const g = globalThis.__fw;
      if (g && g.scene && g.scene.isActive("Game") && !globalThis.__fwGameActiveSeen) {
        globalThis.__fwGameActiveSeen = true;
        M.push({ name: "gameActive", t: now() });
      }
      if (!g || !g.scene || !g.scene.isActive("Game")) globalThis.__fwGameActiveSeen = false;
    };
    setInterval(poll, 2);
    // 点击窗口内仍在飞的网络资源（暖装尾巴归因用；resource 时序同时覆盖 fetch/XHR/IMG）
    const inflight = (globalThis.__fwRes = []);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) inflight.push({ url: e.name, start: e.startTime, end: e.responseEnd });
    }).observe({ type: "resource", buffered: true });
    M.push({ name: "hookInstalled", t: now() });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

async function runOnce(server, browser, round, withProf) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctx.addInitScript(INIT_HOOK);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const g = globalThis.__fw;
    return g && g.scene && g.scene.isActive("Menu");
  }, null, { timeout: 30000, polling: 20 });
  await page.fill("#password", PASSWORD);
  if (!COLD) {
    // 驻留口径（缺省，对齐 r5 409ms 档）：等 MenuScene 后台暖装真正落定——
    // ground 图集纹理已入 cache 且 300ms 无新资源完成（首版只看"300ms 无完成"，
    // 暖装启动后首个资源完成前的静默窗会被误判为落定，快连接轮次把暖装尾巴
    // 甩进 bgWarmSettled 等待段，见 r8 报告勘误）
    await page.waitForFunction(() => {
      const g = globalThis.__fw;
      const warmDone = g && g.textures && g.textures.exists("ground");
      const r = globalThis.__fwRes ?? [];
      const last = r.length ? r[r.length - 1].end : 0;
      return warmDone && performance.now() - last > 300;
    }, null, { timeout: 30000, polling: 50 });
  }
  // 关键路径剖析窗口：CDP Profiler 覆盖 click→gameActive
  let cdp = null;
  if (withProf) {
    cdp = await ctx.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
  }
  const tClick = await page.evaluate(() => {
    globalThis.__fwM.push({ name: "click", t: performance.now() });
    return performance.now();
  });
  await page.click("#btn-create");
  await page.waitForFunction(() => {
    const g = globalThis.__fw;
    return g && g.scene && g.scene.isActive("Game");
  }, null, { timeout: 30000, polling: 5 });
  await page.waitForTimeout(20); // 让 2ms 轮询的 gameActive 打点落袋
  const marks = await page.evaluate(() => globalThis.__fwM);
  const res = await page.evaluate(() => globalThis.__fwRes);
  let prof = null;
  if (withProf) {
    prof = (await cdp.send("Profiler.stop")).profile;
    await cdp.detach();
  }
  await ctx.close();

  // 里程碑 → 分段
  const at = (name) => marks.find((m) => m.name === name)?.t;
  const fetches = marks.filter((m) => m.name === "fetch");
  // matchmake 走 resource 时序（fetch/XHR 双覆盖；resource entry 与 performance.now() 同一时基）
  const mmEnd = res.filter((r) => r.url.includes("/matchmake")).at(-1)?.end;
  const levelStart = fetches.find((f) => f.url.includes("/api/level/"))?.start;
  const levelEnd = fetches.filter((f) => f.url.includes("/api/level/") || f.url.includes("/tilesets/")).at(-1)?.end;
  const templeEnd = fetches.find((f) => f.url.includes("temple.json"))?.end;
  const seg = {
    clickToMatchmake: mmEnd != null ? +(mmEnd - tClick).toFixed(1) : null,
    matchmakeToLevel: mmEnd != null && levelStart != null ? +(levelStart - mmEnd).toFixed(1) : null,
    levelSpan: levelEnd != null && levelStart != null ? +(levelEnd - levelStart).toFixed(1) : null,
    templeSpan: templeEnd != null && levelEnd != null ? +(templeEnd - levelEnd).toFixed(1) : null,
    levelToMenuHidden: +(at("menuHidden") - levelEnd).toFixed(1),
    menuHiddenToGameActive: +(at("gameActive") - at("menuHidden")).toFixed(1),
    clickToGameActive: +(at("gameActive") - tClick).toFixed(1),
  };
  // 点击窗口内仍未完成的资源（>click 起点且 end>menuHidden 附近仍在飞）
  const warmTail = res.filter((r) => r.end > at("menuHidden") - 5 && r.start < at("menuHidden")).length;
  const fmt = (v) => (v == null ? "—" : v.toFixed(1));
  log(
    `run${round}: 总=${fmt(seg.clickToGameActive)}ms  matchmake=${fmt(seg.clickToMatchmake)} ` +
    `ws+state→level起=${fmt(seg.matchmakeToLevel)} level拉取=${fmt(seg.levelSpan)} temple=${fmt(seg.templeSpan)} ` +
    `→menu隐=${fmt(seg.levelToMenuHidden)} →Game激活=${fmt(seg.menuHiddenToGameActive)}${warmTail ? ` 暖装尾巴资源=${warmTail}` : ""}`,
  );
  return { seg, warmTail, prof, pageErrors: errs };
}

const server = await startServer();
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling"],
});
const runs = [];
for (let i = 1; i <= RUNS; i++) runs.push(await runOnce(server, browser, i, argProf && i === RUNS));
await browser.close();
server.kill("SIGTERM");

const pageErrors = runs.flatMap((r) => r.pageErrors);
if (pageErrors.length) {
  log("页面错误（失败）：", pageErrors.join("; "));
  process.exit(1);
}

const med = (key) => {
  const xs = runs.map((r) => r.seg[key]).filter((v) => v != null).sort((a, b) => a - b);
  return xs.length ? +(xs[Math.floor(xs.length / 2)]).toFixed(1) : null;
};
const summary = {
  clickToGameActive: med("clickToGameActive"),
  clickToMatchmake: med("clickToMatchmake"),
  matchmakeToLevel: med("matchmakeToLevel"),
  levelSpan: med("levelSpan"),
  levelToMenuHidden: med("levelToMenuHidden"),
  menuHiddenToGameActive: med("menuHiddenToGameActive"),
};
log(`中位（${RUNS} 轮）: 总=${summary.clickToGameActive}ms  matchmake=${summary.clickToMatchmake} ` +
    `ws+state=${summary.matchmakeToLevel} level拉取=${summary.levelSpan} →menu隐=${summary.levelToMenuHidden} →Game激活=${summary.menuHiddenToGameActive}`);

if (argProf) {
  const last = runs.at(-1);
  if (last?.prof) {
    const out = join(ROOT, "TEMP", "scene-prof.cpuprofile");
    mkdirSync(join(ROOT, "TEMP"), { recursive: true });
    writeFileSync(out, JSON.stringify(last.prof));
    // 自时间聚合 top15（按函数名+url 尾段）
    const nodes = new Map(last.prof.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dt = last.prof.samples.length ? (last.prof.endTime - last.prof.startTime) / last.prof.samples.length : 0;
    for (const id of last.prof.samples) {
      const n = nodes.get(id);
      if (!n) continue;
      const cf = n.callFrame;
      const url = String(cf.url || "").split("/").slice(-1)[0];
      const key = `${cf.functionName || "(anon)"} @${url}:${cf.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + dt);
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    log("CPU profile 自时间 top15（click→gameActive 窗口，ms）:");
    for (const [k, v] of top) log(`  ${v.toFixed(1).padStart(7)}  ${k}`);
    log(`剖析档：${out}`);
  }
}

const snapshot = {
  meta: { git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(), runs: RUNS, level: LEVEL, mode: COLD ? "cold" : "dwell" },
  summary,
  perRun: runs.map((r) => r.seg),
};
if (argSave) {
  writeFileSync(join(RESULTS, `scene-${argSave}.json`), JSON.stringify(snapshot, null, 2));
  log(`快照：results/scene-${argSave}.json`);
}
if (argCompare) {
  const p = join(RESULTS, `scene-${argCompare}.json`);
  if (!existsSync(p)) { log(`对比快照不存在: ${p}`); process.exit(1); }
  const prev = JSON.parse(readFileSync(p, "utf8"));
  const rows = Object.keys(summary).map((k) => {
    const a = prev.summary[k] ?? null;
    const b = summary[k];
    const d = a != null && a > 0 ? `${(((b - a) / a) * 100).toFixed(1)}%` : "—";
    return { seg: k, before: a, after: b, delta: d };
  });
  console.log("\n[scene] 前后对比（中位 ms，before=" + argCompare + " → after=本次）");
  for (const r of rows) console.log(`  ${r.seg.padEnd(24)} ${String(r.before ?? "—").padStart(8)} → ${String(r.after).padStart(8)}   ${r.delta}`);
}

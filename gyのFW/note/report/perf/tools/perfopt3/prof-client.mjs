/**
 * perfopt3 STEP1 剖析：客户端帧耗时分解（headless chromium + 真服 + 双页入房）。
 *
 * 用法：node TEMP/perfopt3/prof-client.mjs [--mode idle|replay] [--secs 10] [--level forest_01]
 *
 * 采样面（page A = 创建者）：
 *  1) game.events PRE_STEP/POST_STEP/PRE_RENDER/POST_RENDER 打点 → 每帧
 *     update 段（含全局管理器+场景）/render 段/帧总时长分布（p50/p95/p99）
 *  2) game.loop.rawDelta / actualFps / smoothDelta 每帧记录
 *  3) performance.memory（--enable-precise-memory-info）逐帧 usedJSHeapSize 差分
 *     → 正增量累计 = 近似分配速率（KB/s），负跳变 = GC 事件
 *  4) GameScene.update / updateMechs / mechTarget 自身打点（仅本仓函数）
 *  5) longtask observer（>50ms 任务计数）
 * 输出：JSON 到 stdout（node 侧聚合分位数）。
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PORT = 3593;
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const MODE = argOf("mode", "idle"); // idle | replay
const SECS = Number(argOf("secs", "10"));
const LEVEL = argOf("level", "forest_01");
const log = (...a) => console.error("[prof]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
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
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/** 页内采样钩子：挂 game.events + 场景方法包裹，记录到 window.__prof */
const INSTALL_HOOK = `(() => {
  const g = window.__fw;
  if (!g) throw new Error("no __fw");
  const P = window.__prof = {
    frames: [],       // {t, raw, smooth, fps, update, render, total, gsUpdate, gsMechs, gsPlayers, gsDiamonds, gsCam, heap}
    longtasks: [],
    gcDrops: [],      // {t, dropKB}
    mechCalls: 0,
    sceneChildren: 0,
    renderer: g.renderer.type === 2 ? "webgl" : "canvas",
  };
  const ee = g.events;
  const scene = g.scene.getScene("Game");
  // 包裹 GameScene.update
  const origUpdate = scene.update.bind(scene);
  const origMechs = scene.updateMechs ? scene.updateMechs.bind(scene) : null;
  const origPlayers = scene.updatePlayers ? scene.updatePlayers.bind(scene) : null;
  const origDiamonds = scene.updateDiamonds ? scene.updateDiamonds.bind(scene) : null;
  scene.update = (...a) => {
    const t0 = performance.now();
    P.gsUpdate = t0;
    origUpdate(...a);
    const t1 = performance.now();
    P._gsUpdateMs = t1 - t0;
  };
  if (origMechs) scene.updateMechs = (st, now, d) => {
    const t0 = performance.now();
    origMechs(st, now, d);
    P._gsMechsMs = performance.now() - t0;
  };
  if (origPlayers) scene.updatePlayers = (st, d) => {
    const t0 = performance.now();
    origPlayers(st, d);
    P._gsPlayersMs = performance.now() - t0;
  };
  if (origDiamonds) scene.updateDiamonds = (st) => {
    const t0 = performance.now();
    origDiamonds(st);
    P._gsDiamondsMs = performance.now() - t0;
  };
  // mechTarget 计数（对象分配大户嫌疑）
  if (scene.mechTarget) {
    const origMT = scene.mechTarget.bind(scene);
    scene.mechTarget = (...a) => { P.mechCalls++; return origMT(...a); };
  }
  let f = null;
  ee.on("prestep", (time, delta) => {
    f = { t: time, raw: g.loop.rawDelta, smooth: g.loop.delta, fps: g.loop.actualFps };
    if (performance.memory) f.heap = performance.memory.usedJSHeapSize;
  });
  ee.on("poststep", () => { if (f) f.update = performance.now() - f._t0; });
  ee.on("prestep", () => { if (f) f._t0 = performance.now(); });
  ee.on("prerender", () => { if (f) f._t1 = performance.now(); });
  ee.on("postrender", () => {
    if (!f) return;
    const t2 = performance.now();
    f.total = t2 - f._t0;
    f.render = t2 - (f._t1 ?? t2);
    f.update = (f._t1 ?? t2) - f._t0;
    f.gsUpdate = P._gsUpdateMs ?? 0;
    f.gsMechs = P._gsMechsMs ?? 0;
    f.gsPlayers = P._gsPlayersMs ?? 0;
    f.gsDiamonds = P._gsDiamondsMs ?? 0;
    P.frames.push(f);
    f = null;
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.longtasks.push({ start: e.startTime, dur: e.duration, name: e.name });
    }).observe({ entryTypes: ["longtask"] });
  } catch {}
  P.sceneChildren = scene.children ? scene.children.length : -1;
  return { renderer: P.renderer, sceneChildren: P.sceneChildren, hasMech: !!origMechs };
})()`;

async function enterAs(page, mode, roomCode) {
  const BASE = `http://127.0.0.1:${PORT}`;
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "prof-pw");
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  await page.waitForSelector("#menu", { state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  return (await page.textContent("#hud-room")).match(/房间码 ([^（\s]+)/)?.[1] ?? "";
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    const errs = [];
    a.on("pageerror", (e) => errs.push("A:" + String(e)));
    b.on("pageerror", (e) => errs.push("B:" + String(e)));
    const code = await enterAs(a, "create", "");
    await enterAs(b, "join", code);
    await a.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
    await b.waitForFunction(() => window.__fwInit?.net?.room?.state?.phase === "started", null, { timeout: 20000 });
    log("房间已开局", code);

    // replay 模式：按路线时间线注入键盘（page A=方向键 / page B=WASD）
    let timeline = null;
    if (MODE === "replay") {
      const routeDoc = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
      const KEYS = { fb: { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" }, wg: { up: "KeyW", left: "KeyA", right: "KeyD" } };
      const evs = [];
      for (const [role, pg] of [["fb", a], ["wg", b]]) {
        for (const ev of routeDoc[role]) evs.push({ t: Math.round(ev.f * (1000 / routeDoc.tickHz)) - 10, pg, key: KEYS[role][ev.dir], type: ev.type });
      }
      evs.sort((x, y) => x.t - y.t);
      const totalMs = routeDoc.totalFrames * (1000 / routeDoc.tickHz);
      timeline = (async () => {
        const t0 = Date.now();
        let i = 0;
        while (i < evs.length) {
          const wait = evs[i].t - (Date.now() - t0);
          if (wait > 0) await sleep(Math.min(wait, 100)); else await sleep(0);
          if (Date.now() - t0 >= evs[i].t) {
            await evs[i].pg.keyboard[evs[i].type](evs[i].key);
            i++;
          }
        }
        return totalMs;
      })();
    }

    // 等 2s 稳态再挂钩 + 采样
    await sleep(2000);
    const meta = await a.evaluate(INSTALL_HOOK);
    log("钩子就绪", JSON.stringify(meta));
    await sleep(SECS * 1000);
    const prof = await a.evaluate(() => {
      const P = window.__prof;
      const out = { frames: P.frames, longtasks: P.longtasks, mechCalls: P.mechCalls, renderer: P.renderer, sceneChildren: P.sceneChildren };
      // heap 差分
      let posSum = 0, gcDrops = [];
      for (let i = 1; i < P.frames.length; i++) {
        const d = (P.frames[i].heap ?? 0) - (P.frames[i - 1].heap ?? 0);
        if (d > 0) posSum += d;
        else if (d < -200 * 1024) gcDrops.push({ t: P.frames[i].t, dropKB: +(-d / 1024).toFixed(0) });
      }
      out.heap = {
        startKB: +(P.frames[0].heap / 1024).toFixed(0),
        endKB: +(P.frames[P.frames.length - 1].heap / 1024).toFixed(0),
        allocKB: +(posSum / 1024).toFixed(1),
        gcDrops,
      };
      const scene = window.__fw.scene.getScene("Game");
      out.dyn = {
        displayListLen: scene.children.length,
        mechSmSize: scene.mechSm ? scene.mechSm.size : -1,
        navyItems: scene.navyItems ? scene.navyItems.length : -1,
        tutorialItems: scene.tutorialItems ? scene.tutorialItems.length : -1,
        phase: String(window.__fwInit.net.room.state.phase),
        fpsNow: window.__fw.loop.actualFps,
      };
      return out;
    });
    if (timeline) await timeline;
    prof.meta = { mode: MODE, secs: SECS, level: LEVEL, ...meta, pageErrors: errs };
    process.stdout.write(JSON.stringify(prof));
  } finally {
    await browser.close().catch(() => {});
    try { server.kill(); } catch {}
    await sleep(400);
    try { server.kill("SIGKILL"); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * capture.mjs — 原版金轨迹采集器（Playwright + 系统 Edge/Chrome，不下载浏览器）
 *
 * 用法：
 *   node scripts/baseline/capture.mjs --level forest_01 --script s.json --out golden/a1.json --runs 2
 *
 * 关键参数：
 *   --level <id>       关卡 id（如 forest_01；自动在 temple.json levels 里按文件名后缀匹配真实路径）
 *   --script <file>    帧序输入脚本 JSON：[{ "f": 120, "down": ["right"] }, { "f": 200, "up": ["right"], "down": ["up"] }]
 *                      键名：left/up/right/down（火人方向键 37/38/39/40），a/w/d/s（水女孩 65/87/68/83）
 *                      语义：从第 f 帧（物理 Step 序号）起按键状态增量
 *   --frames <n>       每个行程（epoch）采样帧数上限（默认 720 ≈ 60fps×12s）
 *   --runs <n>         确定性复验连跑次数（默认 1；≥2 时输出逐帧漂移对比）
 *   --out <file>       输出 JSON（默认 scripts/baseline/golden/<level>_<ts>.json）
 *   --shot <f1,f2..>   在指定采样帧截图（调试用，存 TEMP/baseline/shots/；截图有节流扰动，金轨迹勿用）
 *   --render           保持渲染开启（配合 --shot 用）；默认 lockRender=true 跳过渲染提速约 30 倍
 *   --restarts <n>     死亡/通关后自动重进关卡继续采（默认 0）
 *   --settle <n>       死亡/通关后再采 n 帧才重启/收尾（默认 90 ≈ 1.5s）
 *   --fixed-dt <sec>   【偏离原版模式】把每次 Step 的 dt 钉成常数（如 0.016667），
 *                      消除可变帧率混沌以做严格对拍；金轨迹默认不用（保持引擎真实 dt）
 *
 * 采集原理（全部实测验证，详见 README.md）：
 *  - Phaser 实例：require('Phaser').GAMES[0]；Level 状态实例：game.level
 *  - 跳关：game.currentTemple = temple; game.state.add('level', Level);
 *          game.state.start('level', true, false, levelData)
 *  - 步进钩子：Level.loadComplete 覆写了【实例属性】game.physics.box2d.update（paused 门控 +
 *    world.Step(min(0.04, elapsed/1000), 8, 3)）。本采集器再包一层：Step 前按 frameIndex 注入
 *    合成 KeyboardEvent，Step 后采样全部被跟踪刚体。
 *  - 坐标系：采样值为 box2d 原始物理坐标（米，y 向上，负空间）；屏幕像素 = (-32·x, -32·y)。
 *  - console.log 被游戏覆写为 noop（init.js @2262459）：addInitScript 预存 window.__origLog 供探针。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKROOT = path.resolve(__dirname, "../.."); // gyのFW/
const GOLDEN_DIR = path.join(__dirname, "golden");
const SHOT_DIR = path.resolve(WORKROOT, "TEMP/baseline/shots");
const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";

// ---------- 参数 ----------
function parseArgs(argv) {
  const a = { frames: 720, runs: 1, restarts: 0, level: "forest_01", shots: [], settle: 90 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--level") a.level = argv[++i];
    else if (k === "--script") a.script = argv[++i];
    else if (k === "--frames") a.frames = Number(argv[++i]);
    else if (k === "--runs") a.runs = Number(argv[++i]);
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--shot") a.shots.push(...argv[++i].split(",").map(Number));
    else if (k === "--render") a.render = true;
    else if (k === "--restarts") a.restarts = Number(argv[++i]);
    else if (k === "--settle") a.settle = Number(argv[++i]);
    else if (k === "--fixed-dt") a.fixedDt = Number(argv[++i]);
    else throw new Error("unknown arg " + k);
  }
  return a;
}
const args = parseArgs(process.argv);
const inputScript = args.script ? JSON.parse(fs.readFileSync(path.resolve(args.script), "utf8")) : [];

// ---------- 浏览器 ----------
async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      const b = await chromium.launch({
        channel,
        headless: true,
        args: [
          "--mute-audio",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
        ],
      });
      console.log(`[capture] browser channel: ${channel}`);
      return b;
    } catch (e) {
      console.log(`[capture] channel ${channel} unavailable: ${String(e).split("\n")[0]}`);
    }
  }
  throw new Error("no system Edge/Chrome found");
}

// ---------- 页面内常量脚本 ----------
const INIT_HOOKS = `
  window.__origLog = console.log.bind(console);
  window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40, a: 65, w: 87, d: 68, s: 83 };
  window.__dispatchKey = function (type, code) {
    var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
    Object.defineProperty(ev, 'which', { get: function () { return code; } });
    Object.defineProperty(ev, 'key', { get: function () { return String(code); } });
    document.dispatchEvent(ev);
  };
`;

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const RESOLVE_LEVEL = (level) => `(function () {
  var g = require('Phaser').GAMES[0];
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  if (!temple) return null;
  var hit = temple.levels.find(function (l) { return l.filename.indexOf('/${level}.json') >= 0; });
  return hit ? hit.filename : null;
})()`;

const NAVIGATE = (filename) => `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename === ${JSON.stringify(filename)}; });
  if (!levelData) throw new Error('level not found: ${filename}');
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename, id: levelData.id, type: levelData.type, time: levelData.time };
})()`;

const LEVEL_INFO = `(function () {
  var g = require('Phaser').GAMES[0], L = g.level, p = g.physics.box2d;
  return {
    levelPath: L.levelPath,
    stateName: g.state.current,
    ptmRatio: p.ptmRatio,
    velocityIterations: p.velocityIterations,
    positionIterations: p.positionIterations,
    gravityYpx: p.gravity.y,
    useElapsedTime: p.useElapsedTime,
    spawn: { fb: { x: L.pers1.body.x, y: L.pers1.body.y }, wg: { x: L.pers2.body.x, y: L.pers2.body.y } },
  };
})()`;

// 安装步进钩子。必须在 paused===false（startLevel 之后）执行，此时 plugin.update 是引擎自己的覆写版。
const INSTALL_HOOK = (script, maxFrames, settle, maxRestarts, fixedDt) => `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update; // 引擎覆写版（paused 门控 + Step(min(0.04,elapsed), 8, 3)）

  // ---- 设备识别：instanceof 全谱（模块类从 requirejs 容器取）----
  var DEV = {};
  ['Ball','Beamer','Box','BoxHeavy','BoxMirror','Diamond','Door','Hanging','InfiniteMirror','Lever','LightPusher','Liquid','MovingPlatform','Portal','Pulley','Pusher','Roman','RotMirror','Slider','Snow','TimedPusher','Wind','Window']
    .forEach(function (n) { try { DEV[n] = require('States/Level/Devices/' + n); } catch (e) {} });
  function clsOf(d) { for (var n in DEV) if (DEV[n] && d instanceof DEV[n]) return n; return 'Device'; }
  function deviceBody(d) {
    try {
      var c = clsOf(d);
      if (c === 'Lever') return d.body ? d.body.data : null;                  // 拉杆：杆体（含角度）
      if (c === 'Pusher') return d.button && d.button.body ? d.button.body.data : null; // 按钮：踏板体
      if (d.sprite && d.sprite.body) return d.sprite.body.data;               // 平台/箱子等
      if (d.body) return d.body.data;
    } catch (e) {}
    return null;
  }

  var tracked = [];
  function track(tag, body, kind, device) { if (body) tracked.push({ tag: tag, body: body, kind: kind, device: device || null }); }
  track('fb', L.pers1.body.data, 'char', null);   // 火人（方向键）
  track('wg', L.pers2.body.data, 'char', null);   // 水女孩（WASD）
  var devIdx = {};
  (L.objects || []).forEach(function (d) {
    var c = clsOf(d);
    var type = (d.options && d.options.type) || c.toLowerCase();
    var i = (devIdx[type] = (devIdx[type] || 0) + 1) - 1;
    track(type + '_' + i, deviceBody(d), 'device', d);
  });
  var groundBody = null, b = g.physics.box2d.world.GetBodyList();
  while (b) { if (b.GetUserData && b.GetUserData() === 'ground') { groundBody = b; break; } b = b.GetNext(); }
  track('ground', groundBody, 'static', null);

  window.__cap = {
    frameIndex: 0, cursor: 0, keyState: {},
    samples: [], events: [],
    script: ${JSON.stringify(script)},
    maxFrames: ${maxFrames}, settle: ${settle}, maxRestarts: ${maxRestarts},
    restarts: 0, endFrame: null, restartRequested: false, stopped: false, status: 'running',
    trackedMeta: tracked.map(function (t) {
      return {
        tag: t.tag, kind: t.kind, cls: t.device ? clsOf(t.device) : null,
        type: t.device && t.device.options ? t.device.options.type : null,
        options: t.device && t.device.options ? JSON.parse(JSON.stringify(t.device.options)) : null,
      };
    }),
  };
  var cap = window.__cap;

  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function sample(fi, dt) {
    var bodies = {};
    for (var i = 0; i < tracked.length; i++) {
      var t = tracked[i]; if (!t.body) continue;
      var p = t.body.GetPosition(), v = t.body.GetLinearVelocity();
      bodies[t.tag] = { x: r4(p.x), y: r4(p.y), a: r4(t.body.GetAngle()), vx: r4(v.x), vy: r4(v.y) };
    }
    cap.samples.push({
      f: fi, dt: r4(dt), b: bodies,
      fl: {
        ended: !!L.ended,
        d1up: !!(L.door1 && L.door1.isUp), d2up: !!(L.door2 && L.door2.isUp),
        d1open: !!(L.door1 && L.door1.isOpen), d2open: !!(L.door2 && L.door2.isOpen),
        dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead,
        paused: !!plugin.paused,
      },
    });
  }

  plugin.update = function () {
    if (cap.stopped) { origUpdate.call(this); return; }
    // Step 前：按 frameIndex 应用输入脚本增量（只在状态变化时发事件）
    var s = cap.script;
    while (cap.cursor < s.length && s[cap.cursor].f <= cap.frameIndex) {
      var step = s[cap.cursor++];
      var dn = step.down || [], up = step.up || [];
      for (var i = 0; i < dn.length; i++) {
        var c1 = window.__KEYMAP[dn[i]]; if (c1 == null) continue;
        if (!cap.keyState[dn[i]]) { cap.keyState[dn[i]] = true; window.__dispatchKey('keydown', c1); cap.events.push({ f: cap.frameIndex, type: 'down', key: dn[i] }); }
      }
      for (var j = 0; j < up.length; j++) {
        var c2 = window.__KEYMAP[up[j]]; if (c2 == null) continue;
        if (cap.keyState[up[j]]) { cap.keyState[up[j]] = false; window.__dispatchKey('keyup', c2); cap.events.push({ f: cap.frameIndex, type: 'up', key: up[j] }); }
      }
    }
    var dt = Math.min(0.04, this.game.time.elapsed / 1e3); // 与引擎同式
    if (${fixedDt || 0} > 0) { dt = ${fixedDt}; this.game.time.elapsed = ${fixedDt} * 1e3; } // --fixed-dt 偏离模式
    origUpdate.call(this);
    if (this.paused) {
      // 死亡/通关会立刻 pause 物理：补采一帧终止状态，否则最后一个采样永远停在死亡前
      if (!cap.pausedSampled) {
        cap.pausedSampled = true;
        sample(cap.frameIndex, 0);
        var flT = cap.samples[cap.samples.length - 1].fl;
        if (flT.ended || flT.dead1 || flT.dead2) {
          cap.endFrame = cap.frameIndex;
          // 原版 checkEndGame：死亡也会置 ended —— 用 dead 标志区分真死与通关
          cap.status = (flT.dead1 || flT.dead2) ? 'dead' : 'ended';
          if (cap.restarts < cap.maxRestarts) cap.restartRequested = true;
          cap.stopped = true;
        }
      }
      return;
    }
    sample(cap.frameIndex, dt);
    cap.frameIndex++;
    // 终止/重启判定
    var fl = cap.samples[cap.samples.length - 1].fl;
    if (fl.ended || fl.dead1 || fl.dead2) {
      if (cap.endFrame == null) { cap.endFrame = cap.frameIndex; cap.status = fl.ended ? 'ended' : 'dead'; }
      if (cap.frameIndex - cap.endFrame >= cap.settle) {
        if (cap.restarts < cap.maxRestarts) { cap.restarts++; cap.restartRequested = true; cap.stopped = true; }
        else cap.stopped = true;
      }
    } else if (cap.frameIndex >= cap.maxFrames) {
      cap.stopped = true; if (cap.status === 'running') cap.status = 'frames-done';
    }
  };
  return { tracked: cap.trackedMeta.map(function (m) { return m.tag; }) };
})()`;

const DRAIN = `(function () {
  var cap = window.__cap;
  if (!cap) return { frameIndex: -1, status: 'no-cap', stopped: true, chunk: [], events: [] };
  var chunk = cap.samples.splice(0, cap.samples.length);
  var rr = cap.restartRequested; cap.restartRequested = false;
  return { frameIndex: cap.frameIndex, status: cap.status, stopped: cap.stopped, restartRequested: rr, events: cap.events.splice(0, cap.events.length), chunk: chunk };
})()`;

// ---------- 一次采集 run（一个全新 context = 一次全新游戏生命周期） ----------
async function runOnce({ browser, level, script, runIndex }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    return route.continue();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const filename = await page.evaluate(RESOLVE_LEVEL(level));
  if (!filename) throw new Error(`level ${level} not found in temple.json`);
  await page.evaluate(NAVIGATE(filename));
  // 关卡加载偶尔在第二个 context 里卡住（资源请求竞态）：半程补一次跳关
  try {
    await page.waitForFunction(READY_LEVEL, null, { timeout: 25000, polling: 100 });
  } catch {
    console.log("[capture] level not ready in 25s, re-navigating once");
    await page.evaluate(NAVIGATE(filename));
    await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  }
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  if (!args.render && !args.shots.length) {
    // 纯数据采集不需要画面：跳过渲染（Phaser 官方 server 模式）。实测本作 SwiftShader 渲染不是瓶颈，
    // 但关掉可省 GPU/软件光栅开销；需要 --shot 截图时必须保持渲染开启。
    await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  }

  const levelInfo = await page.evaluate(LEVEL_INFO);
  const install = await page.evaluate(INSTALL_HOOK(script, args.frames, args.settle, args.restarts, args.fixedDt));

  // 采样主循环：Node 侧轮询排空；死亡/通关后按 restarts 预算重进
  const frames = [];
  const events = [];
  const shotSet = new Set(args.shots);
  let status = "running", frameIndex = 0, restartsUsed = 0, epoch = 0;
  const epochs = [];
  const t0 = Date.now();
  // 预算：基座 90s（启动+跳关）+ 每 epoch 仿真帧数按 30 步/s 墙钟折算 + settle 余量
  const hardDeadline = t0 + 90000 + Math.ceil(((args.frames + args.settle) / 30) * 1000) * (args.restarts + 1);

  while (Date.now() < hardDeadline) {
    await page.waitForTimeout(120);
    const d = await page.evaluate(DRAIN);
    if (process.env.CAP_DEBUG && d.chunk.length) {
      const now = Date.now();
      if (!global.__lastProg || now - global.__lastProg > 3000) {
        global.__lastProg = now;
        console.log(`[debug] t=${((now - t0) / 1000).toFixed(1)}s frames=${frames.length} lastF=${d.frameIndex} status=${d.status}`);
      }
    }
    for (const s of d.chunk) { s.epoch = epoch; frames.push(s); }
    if (d.events.length) events.push(...d.events);
    frameIndex = d.frameIndex;
    status = d.status;
    // 截图（有节流扰动，仅调试模式用）
    if (shotSet.size) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      for (const f of [...shotSet]) {
        if (f <= frameIndex) {
          shotSet.delete(f);
          await page.screenshot({ path: path.join(SHOT_DIR, `run${runIndex}_ep${epoch}_f${f}.png`) });
        }
      }
    }
    if (d.restartRequested) {
      epochs.push({ epoch, frames: frames.filter((s) => s.epoch === epoch).length, status });
      await page.evaluate(NAVIGATE(filename));
      await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
      await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
      await page.evaluate(INSTALL_HOOK(script, args.frames, args.settle, args.restarts, args.fixedDt));
      epoch++; restartsUsed++; status = "running";
    }
    if (d.stopped) break;
  }
  const wallSec = (Date.now() - t0) / 1000;
  await context.close();
  return { runIndex, filename, levelInfo, tracked: install?.tracked || [], frames, events, status, lastFrameIndex: frameIndex, wallSec, restartsUsed, epochs, pageErrors: errors.slice(0, 10) };
}

// ---------- 确定性对比 ----------
function compareRuns(a, b) {
  const n = Math.min(a.frames.length, b.frames.length);
  const tags = Object.keys(a.frames[0]?.b || {});
  const drift = {};
  for (const t of tags) drift[t] = { dx: 0, dy: 0, atFrame: -1 };
  let divergedFrame = -1;
  for (let i = 0; i < n; i++) {
    const fa = a.frames[i], fb = b.frames[i];
    let bad = false;
    for (const t of tags) {
      const A = fa.b[t], B = fb.b[t];
      if (!A || !B) continue;
      const dx = Math.abs(A.x - B.x), dy = Math.abs(A.y - B.y);
      if (dx > drift[t].dx) { drift[t].dx = dx; drift[t].atFrame = i; }
      if (dy > drift[t].dy) { drift[t].dy = dy; if (drift[t].atFrame < 0) drift[t].atFrame = i; }
      if (dx > 0.01 || dy > 0.01) bad = true; // >1cm 记为可见分叉
    }
    if (bad && divergedFrame < 0) divergedFrame = i;
  }
  return { comparedFrames: n, divergedFrame, driftMeters: drift };
}

// ---------- 主流程 ----------
async function main() {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  const runs = [];
  let filename = null;
  for (let i = 0; i < args.runs; i++) {
    console.log(`[capture] run ${i + 1}/${args.runs} level=${args.level} script=${args.script || "(none)"} maxFrames=${args.frames} restarts=${args.restarts}`);
    let r = null;
    for (let attempt = 1; attempt <= 2 && !r; attempt++) {
      // 每个 run 用全新 browser：实测同 browser 的第二个 context 偶发关卡资源加载竞态
      const browser = await launchBrowser();
      try {
        r = await runOnce({ browser, level: args.level, script: inputScript, runIndex: i });
      } catch (e) {
        if (attempt === 2) throw e;
        console.log(`[capture] run ${i + 1} attempt ${attempt} failed: ${String(e).split("\n")[0]} — retrying`);
      } finally {
        await browser.close().catch(() => {});
      }
    }
    filename = r.filename;
    runs.push(r);
    console.log(`[capture] run ${i + 1} done: frames=${r.frames.length} lastF=${r.lastFrameIndex} status=${r.status} wall=${r.wallSec.toFixed(1)}s restarts=${r.restartsUsed}`);
  }

  const result = {
    meta: {
      level: args.level,
      levelPath: "data/" + (filename || ""),
      url: GAME_URL,
      date: new Date().toISOString(),
      inputScript,
      sampling: {
        hookPoint: "after box2d world.Step — wrapper over instance property game.physics.box2d.update",
        coordinates: "raw box2d physics coords (meters, y-up, negative space); screen px = (-32*x, -32*y)",
        dt: args.fixedDt ? `FIXED ${args.fixedDt}s (--fixed-dt deviation mode, not engine-actual)` : "engine actual per-frame: min(0.04, game.time.elapsed/1000)",
        inputInjection: "synthetic KeyboardEvent(keyCode patched) on document, applied before Step by frame index",
        maxFramesPerEpoch: args.frames,
        settleFramesAfterEnd: args.settle,
        runs: args.runs,
      },
      engine: {
        ptmRatio: runs[0]?.levelInfo?.ptmRatio,
        velocityIterations: runs[0]?.levelInfo?.velocityIterations,
        positionIterations: runs[0]?.levelInfo?.positionIterations,
        gravityYpx: runs[0]?.levelInfo?.gravityYpx,
        useElapsedTime: runs[0]?.levelInfo?.useElapsedTime,
        spawnPx: runs[0]?.levelInfo?.spawn,
      },
    },
    runs: runs.map((r) => ({
      runIndex: r.runIndex,
      frameCount: r.frames.length,
      lastFrameIndex: r.lastFrameIndex,
      status: r.status,
      wallSec: +r.wallSec.toFixed(2),
      restartsUsed: r.restartsUsed,
      epochs: r.epochs,
      trackedBodies: r.tracked,
      events: r.events,
      pageErrors: r.pageErrors,
      frames: r.frames,
    })),
  };
  if (args.runs >= 2) {
    const comparisons = [];
    for (let i = 1; i < runs.length; i++) comparisons.push({ pair: [0, i], ...compareRuns(runs[0], runs[i]) });
    result.determinism = {
      method: "same input script re-run in a fresh browser context; per-frame max |Δpos| in meters (1m = 32px)",
      ...comparisons[0],
      all: comparisons,
    };
  }

  const outPath = path.resolve(args.out || path.join(GOLDEN_DIR, `${args.level}_${Date.now()}.json`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
  console.log("RESULT " + JSON.stringify({
    ok: true,
    out: outPath,
    levelPath: result.meta.levelPath,
    runs: runs.length,
    framesPerRun: runs.map((r) => r.frames.length),
    statusPerRun: runs.map((r) => r.status),
    determinism: result.determinism
      ? { comparedFrames: result.determinism.comparedFrames, divergedFrame: result.determinism.divergedFrame, driftMeters: result.determinism.driftMeters }
      : undefined,
  }));
}

main().catch((e) => { console.error("[capture] FATAL", e); process.exit(1); });

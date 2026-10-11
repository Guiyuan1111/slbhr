// s31-oracle-121.mjs — forest_12_1 双引擎对照探针（原版引擎，serve-original @8787 只读）
// 场景（出生点注入 = 初始条件变更，引擎代码零改动；capture.mjs 同款钩子模式）：
//   O1 竖井 tip 站跳：fb 生于 (128,688) → 落 (128,800) hyp → 跳。内核口径：apex feet 692.2（升 107.8）
//   O2 漏斗顶点钉跳（fb 自东）：内核口径：钉 (543.9,feet415.8)，跳升 ~23、东弹（背离来向）幅 ~27
//   O3 脊顶钉跳（wg 自西）：内核口径：钉 (704.1,feet415.7)，跳升 ~23、西弹
// 判读：oracle 与内核常量吻合 ⇒ 12_1 封死为原版固有；显著偏离 ⇒ 我方引擎缺口（回修内核）。
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667;
const FRAMES = 300;

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

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

// 与 capture.mjs NAVIGATE 全同（temple.levels 条目是元数据，Level 状态按 filename 自取 JSON）
const NAVIGATE = (level) => `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/${level}.json') >= 0; });
  if (!levelData) throw new Error('level not found');
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename };
})()`;

const INSTALL_HOOK = (script) => `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  window.__cap = {
    frameIndex: 0, cursor: 0, keyState: {}, samples: [], events: [],
    script: ${JSON.stringify(script)}, maxFrames: ${FRAMES}, stopped: false, status: 'running',
  };
  var cap = window.__cap;
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function sample(fi, dt) {
    var p1 = L.pers1.body.data.GetPosition(), v1 = L.pers1.body.data.GetLinearVelocity();
    var p2 = L.pers2.body.data.GetPosition(), v2 = L.pers2.body.data.GetLinearVelocity();
    cap.samples.push({
      f: fi, dt: r4(dt),
      fb: { x: r4(p1.x), y: r4(p1.y), vx: r4(v1.x), vy: r4(v1.y) },
      wg: { x: r4(p2.x), y: r4(p2.y), vx: r4(v2.x), vy: r4(v2.y) },
      fl: { ended: !!L.ended, dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead, paused: !!plugin.paused },
    });
  }
  plugin.update = function () {
    if (cap.stopped) { origUpdate.call(this); return; }
    var s = cap.script;
    while (cap.cursor < s.length && s[cap.cursor].f <= cap.frameIndex) {
      var step = s[cap.cursor++];
      var dn = step.down || [], up = step.up || [];
      for (var i = 0; i < dn.length; i++) { var c1 = window.__KEYMAP[dn[i]]; if (c1 != null && !cap.keyState[dn[i]]) { cap.keyState[dn[i]] = true; window.__dispatchKey('keydown', c1); cap.events.push({ f: cap.frameIndex, type: 'down', key: dn[i] }); } }
      for (var j = 0; j < up.length; j++) { var c2 = window.__KEYMAP[up[j]]; if (c2 != null && cap.keyState[up[j]]) { cap.keyState[up[j]] = false; window.__dispatchKey('keyup', c2); cap.events.push({ f: cap.frameIndex, type: 'up', key: up[j] }); } }
    }
    var dt = Math.min(0.04, this.game.time.elapsed / 1e3);
    dt = ${FIXED_DT}; this.game.time.elapsed = ${FIXED_DT} * 1e3;
    origUpdate.call(this);
    if (this.paused) {
      if (!cap.pausedSampled) { cap.pausedSampled = true; sample(cap.frameIndex, 0); cap.status = (cap.samples[cap.samples.length-1].fl.dead1 || cap.samples[cap.samples.length-1].fl.dead2) ? 'dead' : 'ended'; cap.stopped = true; }
      return;
    }
    sample(cap.frameIndex, dt);
    cap.frameIndex++;
    var fl = cap.samples[cap.samples.length - 1].fl;
    if (fl.ended || fl.dead1 || fl.dead2) { cap.status = fl.ended ? 'ended' : 'dead'; cap.stopped = true; }
    else if (cap.frameIndex >= cap.maxFrames) { cap.stopped = true; cap.status = 'frames-done'; }
  };
  return true;
})()`;

const DRAIN = `(function () {
  var cap = window.__cap;
  if (!cap) return { frameIndex: -1, status: 'no-cap', stopped: true, chunk: [], events: [] };
  var chunk = cap.samples.splice(0, cap.samples.length);
  return { frameIndex: cap.frameIndex, status: cap.status, stopped: cap.stopped, events: cap.events.splice(0, cap.events.length), chunk: chunk };
})()`;

const LEVEL_INFO = `(function () {
  var g = require('Phaser').GAMES[0];
  return { spawn: { fb: { x: g.level.pers1.body.x, y: g.level.pers1.body.y }, wg: { x: g.level.pers2.body.x, y: g.level.pers2.body.y } } };
})()`;

async function runScenario(browser, name, gid, sx, sy, script) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  // 出生点注入：拦截关卡 JSON 响应，改写 Chars 层目标 gid 对象坐标（初始条件变更，引擎零改动）
  const raw = readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_12_1.json"), "utf8");
  const mutated = (() => {
    const j = JSON.parse(raw);
    const chars = j.layers.find((l) => l.name === "Chars");
    const o = chars.objects.find((o) => o.gid === gid);
    o.x = sx;
    o.y = sy;
    return JSON.stringify(j);
  })();
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    if (/forest_12_1\.json(\?|$)/.test(u)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: mutated });
    }
    return route.continue();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|404/i.test(t)) errors.push("console:" + t.slice(0, 160));
  });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE("forest_12_1"));
  try {
    await page.waitForFunction(READY_LEVEL, null, { timeout: 25000, polling: 100 });
  } catch {
    console.log(`[s31] ${name}: first wait timeout, errors so far:`, JSON.stringify(errors.slice(-5)));
    await page.evaluate(NAVIGATE("forest_12_1"));
    await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  }
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  const info = await page.evaluate(LEVEL_INFO);
  await page.evaluate(INSTALL_HOOK(script));

  const frames = [];
  let status = "running";
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(120);
    const d = await page.evaluate(DRAIN);
    frames.push(...d.chunk);
    if (d.stopped) { status = d.status; break; }
  }
  await context.close();

  // 分析：目标角色逐帧 screen 位（px y-down；body 中心 *-32；feet = 中心+35）
  const tag = gid === 16 ? "fb" : "wg";
  const pts = frames.map((s) => ({ f: s.f, x: -32 * s[tag].x, y: -32 * s[tag].y + 35 }));
  const settled = pts.filter((p) => p.f >= 30 && p.f < 80);
  const rest = settled.length ? settled[settled.length - 1] : null;
  const flight = pts.filter((p) => p.f >= 80);
  let apex = null;
  for (const p of flight) if (!apex || p.y < apex.y) apex = p;
  // 跳后水平漂移
  const drift = flight.length && rest ? Math.max(...flight.map((p) => Math.abs(p.x - rest.x))) : 0;
  const driftDir = flight.length && rest ? (flight.reduce((acc, p) => (p.y < rest.y - 5 ? acc + p.x : acc), 0) / Math.max(1, flight.filter((p) => p.y < rest.y - 5).length) - rest.x) : 0;
  return {
    name, status, errors: errors.slice(0, 3),
    spawnPx: { x: -32 * info.spawn[tag].x, y: -32 * info.spawn[tag].y + 35 },
    restFeet: rest ? { f: rest.f, x: +rest.x.toFixed(1), y: +rest.y.toFixed(1) } : null,
    apexFeet: apex ? { f: apex.f, x: +apex.x.toFixed(1), y: +apex.y.toFixed(1) } : null,
    rise: rest && apex ? +(rest.y - apex.y).toFixed(1) : null,
    driftAbs: +drift.toFixed(1),
    driftDirPx: +driftDir.toFixed(1),
    nFrames: frames.length,
  };
}

const browser = await (async () => {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (e) {
      console.log(`[s31] channel ${channel} failed: ${String(e).slice(0, 80)}`);
    }
  }
  return chromium.launch();
})();
const out = {};

const SCEN = [
  // O1 竖井 tip 站跳：fb 生于 tile (128,688)，落 (128,800) hyp，f80 起跳持 25f
  { key: "O1_stairwell_tip", gid: 16, x: 128, y: 688, script: [{ f: 80, down: ["up"] }, { f: 105, up: ["up"] }] },
  // O2 漏斗顶点钉跳：fb 直接生于顶点 (543.9,feet415.8) 上方 → 中心 (543.9,380.8) → 对象 (512,349)
  { key: "O2_funnel_pin", gid: 16, x: 512, y: 349, script: [{ f: 80, down: ["up"] }, { f: 105, up: ["up"] }] },
  // O3 脊顶钉跳：wg 直接生于脊顶 (704.1,feet415.7) 上方 → 中心 (704.1,380.7) → 对象 (672,349)
  { key: "O3_ridge_pin", gid: 17, x: 672, y: 349, script: [{ f: 80, down: ["w"] }, { f: 105, up: ["w"] }] },
];

for (const s of SCEN) {
  try {
    out[s.key] = await runScenario(browser, s.key, s.gid, s.x, s.y, s.script);
    console.log(`[s31] ${s.key}:`, JSON.stringify(out[s.key]));
  } catch (e) {
    out[s.key] = { error: String(e).slice(0, 200) };
    console.log(`[s31] ${s.key} FAILED:`, String(e).slice(0, 200));
  }
}

await browser.close();
writeFileSync("TEMP/s31-oracle-121-out.json", JSON.stringify(out, null, 1));
console.log("written TEMP/s31-oracle-121-out.json");

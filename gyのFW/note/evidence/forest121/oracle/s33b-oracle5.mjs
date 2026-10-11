// s33b-oracle5.mjs — oracle 侧 5+1 点位统一协议（与 s33a 内核镜像同生位/同跳窗口/同量测）
// 场景对象坐标 = 中心(32,32)上方 64px 落点：obj = (cx−32, cy−32−64)
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667;
const FRAMES = 220;

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
  window.__cap = { frameIndex: 0, cursor: 0, keyState: {}, samples: [], events: [], script: ${JSON.stringify(script)}, maxFrames: ${FRAMES}, stopped: false, status: 'running' };
  var cap = window.__cap;
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function sample(fi, dt) {
    var p1 = L.pers1.body.data.GetPosition(), p2 = L.pers2.body.data.GetPosition();
    cap.samples.push({ f: fi, dt: r4(dt), fb: { x: r4(p1.x), y: r4(p1.y) }, wg: { x: r4(p2.x), y: r4(p2.y) }, fl: { dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead, paused: !!plugin.paused } });
  }
  plugin.update = function () {
    if (cap.stopped) { origUpdate.call(this); return; }
    var s = cap.script;
    while (cap.cursor < s.length && s[cap.cursor].f <= cap.frameIndex) {
      var step = s[cap.cursor++];
      var dn = step.down || [], up = step.up || [];
      for (var i = 0; i < dn.length; i++) { var c1 = window.__KEYMAP[dn[i]]; if (c1 != null && !cap.keyState[dn[i]]) { cap.keyState[dn[i]] = true; window.__dispatchKey('keydown', c1); } }
      for (var j = 0; j < up.length; j++) { var c2 = window.__KEYMAP[up[j]]; if (c2 != null && cap.keyState[up[j]]) { cap.keyState[up[j]] = false; window.__dispatchKey('keyup', c2); } }
    }
    var dt = ${FIXED_DT}; this.game.time.elapsed = ${FIXED_DT} * 1e3;
    origUpdate.call(this);
    if (this.paused) { if (!cap.pausedSampled) { cap.pausedSampled = true; sample(cap.frameIndex, 0); cap.status = (cap.samples[cap.samples.length-1].fl.dead1 || cap.samples[cap.samples.length-1].fl.dead2) ? 'dead' : 'ended'; cap.stopped = true; } return; }
    sample(cap.frameIndex, dt);
    cap.frameIndex++;
    var fl = cap.samples[cap.samples.length - 1].fl;
    if (fl.dead1 || fl.dead2) { cap.status = 'dead'; cap.stopped = true; }
    else if (cap.frameIndex >= cap.maxFrames) { cap.stopped = true; cap.status = 'frames-done'; }
  };
  return true;
})()`;
const DRAIN = `(function () {
  var cap = window.__cap;
  if (!cap) return { frameIndex: -1, status: 'no-cap', stopped: true, chunk: [] };
  return { frameIndex: cap.frameIndex, status: cap.status, stopped: cap.stopped, chunk: cap.samples.splice(0, cap.samples.length) };
})()`;

async function runScenario(browser, scen) {
  const { key, gid, ox, oy, key: _k, jkey } = scen;
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const raw = readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_12_1.json"), "utf8");
  const j = JSON.parse(raw);
  const chars = j.layers.find((l) => l.name === "Chars");
  const o = chars.objects.find((o) => o.gid === gid);
  o.x = ox;
  o.y = oy;
  const mutated = JSON.stringify(j);
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    if (/forest_12_1\.json(\?|$)/.test(u)) return route.fulfill({ status: 200, contentType: "application/json", body: mutated });
    return route.continue();
  });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  let ready = false;
  for (let attempt = 0; attempt < 3 && !ready; attempt++) {
    await page.evaluate(NAVIGATE("forest_12_1"));
    try {
      await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 });
      ready = true;
    } catch (e) {
      console.log(`[s33b] ${key}: nav attempt ${attempt + 1} failed`);
    }
  }
  if (!ready) throw new Error("level not ready after 3 attempts");
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  await page.evaluate(INSTALL_HOOK([{ f: 80, down: [jkey] }, { f: 105, up: [jkey] }]));

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

  const tag = gid === 16 ? "fb" : "wg";
  const trace = frames.map((s) => ({ f: s.f, x: +(-32 * s[tag].x).toFixed(2), y: +(-32 * s[tag].y + 35.2).toFixed(2) }));
  const rest = trace.filter((t) => t.f >= 70 && t.f < 80).pop() || trace[trace.length - 1];
  const flight = trace.filter((t) => t.f >= 80 && t.f <= 170);
  let min = null;
  for (const p of flight) if (!min || p.y < min.y) min = p;
  const after = flight.filter((p) => p.f >= 160).pop() || trace[trace.length - 1];
  writeFileSync(`TEMP/s33b-${key}-trace.json`, JSON.stringify(trace.filter((t) => t.f >= 60 && t.f <= 180)));
  return {
    key, status,
    restFeet: rest ? { f: rest.f, x: rest.x, y: rest.y } : null,
    minFeet: min ? { f: min.f, x: min.x, y: min.y } : null,
    rise: rest && min ? +(rest.y - min.y).toFixed(1) : null,
    endFeet: after ? { x: after.x, y: after.y } : null,
  };
}

const SCEN = [
  // A 832台地平地（中心 360,796.7）
  { key: "A_terrace", gid: 16, ox: 328, oy: 700, jkey: "up" },
  // B 竖井 col4 hyp（中心 144,765）
  { key: "B_stairwell_col4", gid: 16, ox: 112, oy: 669, jkey: "up" },
  // C 西坡（oracle O3 原 rest 653.9,462.5 → 生于其上方中心 653.9,417.5 再看落点）
  { key: "C_westslope", gid: 17, ox: 621, oy: 321, jkey: "w" },
  // D1 漏斗顶点（中心 543.9,380.8）
  { key: "D1_funnel_pin", gid: 16, ox: 511, oy: 284, jkey: "up" },
  // D2 脊顶（中心 704.1,380.7）
  { key: "D2_ridge_pin", gid: 17, ox: 672, oy: 284, jkey: "w" },
];

const browser = await (async () => {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {}
  }
  return chromium.launch();
})();
const out = {};
for (const s of SCEN) {
  try {
    out[s.key] = await runScenario(browser, s);
    console.log(`[s33b] ${s.key}:`, JSON.stringify(out[s.key]));
  } catch (e) {
    out[s.key] = { error: String(e).slice(0, 160) };
    console.log(`[s33b] ${s.key} FAILED:`, String(e).slice(0, 160));
  }
}
await browser.close();
writeFileSync("TEMP/s33b-oracle-out.json", JSON.stringify(out, null, 1));

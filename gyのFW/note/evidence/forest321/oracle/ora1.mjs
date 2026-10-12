// r32d ora1: forest_32_1 oracle 对照（双引擎封关证据）
// O1: wg 生于西岸(中心200) 满持跳 25f → 干净弹道升幅（对照内核 126.6 / 理论 123；登台需 160）
// O2: wg 生于按钮坑(中心1152) 静立踩钮 → obj13 平台升起目标（内核: 864→704, 147f; 若 oracle=768 则死锁破）
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667;
const FRAMES = 320;

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
  function findPlat() {
    // obj13 平台: 游戏坐标中心 (−2.5, −27.5)m（home, top=864）; 升起后 y→−22.5 (top=704)
    var out = [];
    for (var b = plugin.world.GetBodyList(); b; b = b.GetNext()) {
      var p = b.GetPosition();
      if (Math.abs(p.x + 2.5) < 0.4 && p.y < -20 && p.y > -30) out.push(r4(p.y));
    }
    return out;
  }
  function sample(fi, dt) {
    var p1 = L.pers1.body.data.GetPosition(), p2 = L.pers2.body.data.GetPosition();
    cap.samples.push({ f: fi, dt: r4(dt), fb: { x: r4(p1.x), y: r4(p1.y) }, wg: { x: r4(p2.x), y: r4(p2.y) }, plat: findPlat(), fl: { dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead, paused: !!plugin.paused } });
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
  const { key, gid, ox, oy, script, boxTo } = scen;
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const raw = readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_32_1.json"), "utf8");
  const j = JSON.parse(raw);
  const chars = j.layers.find((l) => l.name === "Chars");
  const o = chars.objects.find((o) => o.gid === gid);
  o.x = ox; o.y = oy;
  if (boxTo) {
    const objs = j.layers.find((l) => l.name === "Objects");
    const box = objs.objects.find((ob) => ob.id === 7); // obj7 = 箱（生 beamB）
    box.x = boxTo[0]; box.y = boxTo[1];
  }
  const mutated = JSON.stringify(j);
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    if (/forest_32_1\.json(\?|$)/.test(u)) return route.fulfill({ status: 200, contentType: "application/json", body: mutated });
    return route.continue();
  });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  let ready = false;
  for (let attempt = 0; attempt < 3 && !ready; attempt++) {
    await page.evaluate(NAVIGATE("forest_32_1"));
    try {
      await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 });
      ready = true;
    } catch (e) {
      console.log(`[ora1] ${key}: nav attempt ${attempt + 1} failed`);
    }
  }
  if (!ready) throw new Error("level not ready after 3 attempts");
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  await page.evaluate(INSTALL_HOOK(script));

  const frames = [];
  let status = "running";
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(120);
    const d = await page.evaluate(DRAIN);
    frames.push(...d.chunk);
    if (d.stopped) { status = d.status; break; }
  }
  await context.close();

  const tag = gid === 16 ? "fb" : "wg";
  const trace = frames.map((s) => ({ f: s.f, x: +(-32 * s[tag].x).toFixed(2), y: +(-32 * s[tag].y + 35.2).toFixed(2), plat: s.plat }));
  const rest = trace.filter((t) => t.f >= 70 && t.f < 80).pop() || trace[0];
  const flight = trace.filter((t) => t.f >= 80 && t.f <= 200);
  let min = null;
  for (const p of flight) if (!min || p.y < min.y) min = p;
  // 平台轨迹（O2）: plat y → top = -32*y - 16
  let platTop0 = null, platTopEnd = null, riseStartF = null, riseEndF = null;
  const platTrace = frames.map((s) => ({ f: s.f, tops: (s.plat || []).map((yy) => +(-32 * yy - 16).toFixed(1)) })).filter((t) => t.tops.length);
  if (platTrace.length) {
    platTop0 = platTrace[0].tops[0];
    platTopEnd = platTrace[platTrace.length - 1].tops[0];
    for (const t of platTrace) { if (t.tops[0] < platTop0 - 1 && riseStartF === null) riseStartF = t.f; if (riseStartF !== null && Math.abs(t.tops[0] - platTopEnd) < 0.6) { riseEndF = t.f; break; } }
  }
  writeFileSync(`TEMP/r32/ora1-${key}-trace.json`, JSON.stringify(trace.filter((t) => t.f >= 60 && t.f <= (key === "O2" ? 320 : 200))));
  return {
    key, status,
    restFeet: rest ? { f: rest.f, x: rest.x, y: rest.y } : null,
    minFeet: min ? { f: min.f, x: min.x, y: min.y } : null,
    rise: rest && min ? +(rest.y - min.y).toFixed(1) : null,
    plat: { topStart: platTop0, topEnd: platTopEnd, riseStartF, riseEndF, nBodies: platTrace[0]?.tops.length ?? 0 },
  };
}

const only = process.argv[2];
const SCEN = [
  { key: "O1_bank_jump", gid: 17, ox: 168, oy: 864, script: [{ f: 80, down: ["w"] }, { f: 105, up: ["w"] }] },
  { key: "O1b_hold40", gid: 17, ox: 168, oy: 864, script: [{ f: 80, down: ["w"] }, { f: 120, up: ["w"] }] },
  { key: "O2a_wg_stand", gid: 17, ox: 1120, oy: 864, script: [] },
  { key: "O2b_fb_stand", gid: 16, ox: 1120, oy: 800, script: [] },
  { key: "O2c_box_button", gid: 17, ox: 168, oy: 864, script: [], boxTo: [1120, 864] },
].filter((s) => !only || s.key.startsWith(only));

const browser = await (async () => {
  for (const channel of ["msedge", "chrome"]) {
    try { return await chromium.launch({ channel, headless: true }); } catch {}
  }
  return await chromium.launch();
})();
const out = {};
for (const scen of SCEN) {
  try { out[scen.key] = await runScenario(browser, scen); }
  catch (e) { out[scen.key] = { error: String(e) }; }
}
await browser.close();
writeFileSync("TEMP/r32/ora1-out.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

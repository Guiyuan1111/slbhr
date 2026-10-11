// s35-cleanreeval.mjs — 干净重估后的 oracle 侧 5 场景（只读：level JSON 仅内存替换，不写原文件）
// W1 fb 东台西行撞销(544,416)——内核 v16 f244-248 锁定（vx −118→0 @x543.6）
// W2 fb 隧道顶棚 45° 反射——内核 v17 f242-246（vx −112→+135 东弹）
// W3/W4 绿池 (480-736)@864 liquidType=7 对 fb/wg 致死
// W5 wg 盆地落定 (1021,447.7)——内核 settle2 frac 21（判定翻转：wg 门可达）
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667;
const FRAMES = 300;

const INIT_HOOKS = `
  window.__origLog = console.log.bind(console);
  window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40 };
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
  window.__cap = { frameIndex: 0, cursor: 0, keyState: {}, samples: [], script: ${JSON.stringify(script)}, maxFrames: ${FRAMES}, stopped: false, status: 'running' };
  var cap = window.__cap;
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function sample(fi, dt) {
    var p1 = L.pers1.body.data.GetPosition(), p2 = L.pers2.body.data.GetPosition();
    var v1 = L.pers1.body.data.GetLinearVelocity(), v2 = L.pers2.body.data.GetLinearVelocity();
    cap.samples.push({ f: fi, dt: r4(dt),
      fb: { x: r4(p1.x), y: r4(p1.y), vx: r4(v1.x), vy: r4(v1.y) },
      wg: { x: r4(p2.x), y: r4(p2.y), vx: r4(v2.x), vy: r4(v2.y) },
      fl: { dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead, paused: !!plugin.paused } });
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
    if (this.paused) { if (!cap.pausedSampled) { cap.pausedSampled = true; sample(cap.frameIndex, 0); var l = cap.samples[cap.samples.length-1].fl; cap.status = (l.dead1 || l.dead2) ? 'dead' : 'ended'; cap.stopped = true; } return; }
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
// 结束后只读探测门对象形态（不写任何东西）
const DOORPROBE = `(function () {
  var L = require('Phaser').GAMES[0].level; var out = {};
  ['doors', 'door1', 'door2', 'gates'].forEach(function (k) {
    try { var v = L[k]; if (v && typeof v === 'object') {
      if (v.isUp !== undefined) out[k] = { isUp: !!v.isUp };
      else { var o = {}; Object.keys(v).forEach(function (kk) { var vv = v[kk]; if (vv && typeof vv === 'object' && vv.isUp !== undefined) o[kk] = { isUp: !!vv.isUp }; }); out[k] = Object.keys(o).length ? o : Object.keys(v).slice(0, 8); }
    } } catch (e) {}
  });
  return out;
})()`;

async function runScenario(browser, scen) {
  const { key, gid, ox, oy, script } = scen;
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const raw = readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_12_1.json"), "utf8");
  const j = JSON.parse(raw);
  const chars = j.layers.find((l) => l.name === "Chars");
  const o = chars.objects.find((o) => o.gid === gid);
  o.x = ox; o.y = oy;
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
  for (let attempt = 0; attempt < 4 && !ready; attempt++) {
    if (attempt > 0) { try { await page.goto(GAME_URL, { waitUntil: "domcontentloaded" }); await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 }); } catch {} }
    await page.evaluate(NAVIGATE("forest_12_1"));
    try { await page.waitForFunction(READY_LEVEL, null, { timeout: 25000, polling: 100 }); ready = true; }
    catch (e) { console.log(`[s35] ${key}: nav attempt ${attempt + 1} failed`); }
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
  let doors = null;
  try { doors = await page.evaluate(DOORPROBE); } catch {}
  await context.close();

  const tag = gid === 16 ? "fb" : "wg";
  const px = (s) => ({ f: s.f, x: +(-32 * s[tag].x).toFixed(2), feet: +(-32 * s[tag].y + 35.2).toFixed(2), vx: +(-32 * s[tag].vx).toFixed(1) });
  const tr = frames.map(px);
  writeFileSync(`TEMP/r121b/s35-${key}-trace.json`, JSON.stringify(tr));
  // 摘要
  const sum = { key, status, n: frames.length };
  const last = tr[tr.length - 1];
  if (last) { sum.end = { f: last.f, x: last.x, feet: last.feet, vx: last.vx }; }
  if (key === "W1_fb_walkpin" || key === "W2_fb_tunneljump") {
    const run = tr.filter((t) => t.f >= 40);
    let minX = null, maxVxW = 0, maxVxE = 0;
    for (const p of run) { if (minX === null || p.x < minX) minX = p.x; if (p.vx < maxVxW) maxVxW = p.vx; if (p.vx > maxVxE) maxVxE = p.vx; }
    sum.minX = minX; sum.maxVxWest = maxVxW; sum.maxVxEast = maxVxE;
    sum.crossedPin = run.some((p) => p.x < 543);
    sum.framesNearPin = run.filter((p) => Math.abs(p.x - 543.6) < 1.5).length;
  }
  if (key === "W5_wg_basin") {
    const tail = tr.slice(-40);
    const ax = tail.reduce((a, p) => a + p.x, 0) / tail.length;
    const af = tail.reduce((a, p) => a + p.feet, 0) / tail.length;
    sum.settle = { x: +ax.toFixed(2), feet: +af.toFixed(2), still: tail.every((p) => Math.abs(p.x - ax) < 1) };
    sum.inStrip = ax >= 968 && ax <= 1032 && af >= 446 && af <= 458;
    sum.doors = doors;
  }
  if (key.startsWith("W3") || key.startsWith("W4")) { sum.dead = status === "dead"; sum.doors = doors; }
  return sum;
}

const SCEN = [
  // W5: wg 落门地板盆区 (1064,448) → ox=1032, oy=352
  { key: "W5_wg_basin", gid: 17, ox: 1032, oy: 352, script: [] },
  // W5b: wg 直接落于感应带上方 (1000,448) → ox=968, oy=352
  { key: "W5b_wg_strip", gid: 17, ox: 968, oy: 352, script: [] },
];

const browser = await (async () => {
  for (const channel of ["msedge", "chrome"]) {
    try { return await chromium.launch({ channel, headless: true }); } catch {}
  }
  return chromium.launch();
})();
const out = {};
for (const s of SCEN) {
  try {
    out[s.key] = await runScenario(browser, s);
    console.log(`[s35] ${s.key}:`, JSON.stringify(out[s.key]));
  } catch (e) {
    out[s.key] = { error: String(e).slice(0, 160) };
    console.log(`[s35] ${s.key} FAILED:`, String(e).slice(0, 160));
  }
}
await browser.close();
writeFileSync("TEMP/r121b/s35-oracle-out.json", JSON.stringify(out, null, 1));
console.log("DONE");

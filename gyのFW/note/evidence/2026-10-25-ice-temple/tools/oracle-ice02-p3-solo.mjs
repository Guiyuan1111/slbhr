// oracle-ice02-p3-solo.mjs (v2 原生输入版) — ice_02 oracle 取证 · 第 3 步：fb 单人全程 I4
// 机理修订（v1 实证）: 探针直设 SetLinearVelocity 会被游戏自身角色控制器在 grounded 帧清零 vy
//   （冰面 friction≈0 故 vx 存活）→ v2 改注入原生气泡键盘标志 char.cursors.up/left/right.isDown，
//   全程由原版控制器驱动（跳跃 ApplyLinearImpulse+分支速度、跑动 runForce、冰上减速均原生）。
// S1 = 原生跳标定（踏板顶原地跳，测 apex/feetSensor 条件）；S2 = 全程路由（出板跳→东阶→金字塔→
//   越池→mound→门板楔→穿闸→door1）。wg 停干槽 (1128,285)（斜瓦 1120 与板裙 1136 之间 16px 干区）。
import { chromium } from "playwright";
import { writeFileSync, createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8877;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/C";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-25-ice-temple/tools/artifacts/oracle-ice02-p3-solo-out.json";
const SHOT_DIR = "/home/gy/桌面/dev/slbhr/TEMP/fw-oi2-1";

const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg", ".fnt": "text/plain", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
function startServer() {
  return new Promise((res) => {
    const srv = http.createServer((req, res2) => {
      if (req.method !== "GET" && req.method !== "HEAD") { res2.writeHead(405).end(); return; }
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "gameIndex.html";
      const file = join(ROOT, p);
      if (!file.startsWith(ROOT)) { res2.writeHead(403).end(); return; }
      try { const st = statSync(file); if (!st.isFile()) throw 0; res2.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Content-Length": st.size }); if (req.method === "HEAD") res2.end(); else createReadStream(file).pipe(res2); }
      catch { res2.writeHead(404).end(); }
    });
    srv.listen(PORT, "127.0.0.1", () => res(srv));
  });
}

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'ice'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/ice_02.json') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename };
})()`;

const INSTALL = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  var V = function (x, y) { return new box2d.b2Vec2(x, y); };
  var pers = function (k) { return k === 'wg' ? L.pers2 : L.pers1; };
  function setKey(who, which, down) {
    var c = pers(who); if (!c || !c.cursors || !c.cursors[which]) return;
    var k = c.cursors[which];
    k.isDown = down;
    if ('buttonDown' in k) k.buttonDown = down;
    if (down && 'lastDown' in k) k.lastDown = true;
  }
  window.__setKey = setKey;
  var q = {
    fb: { steps: window.__stepsFB || [], idx: 0, st: null, log: [], groundN: 0 },
    wg: { steps: window.__stepsWG || [], idx: 0, st: null, log: [], groundN: 0 },
  };
  window.__q = q;
  window.__rec = { frame: 0, samples: [], devChanges: [], events: [], done: false, fatal: null, win: null, angling: [], consoleAll: [] };
  var cap = window.__rec;
  var lastDev = {};
  var angCount = 0;
  var origLog = console.log;
  console.log = function () {
    try {
      var s = Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a).slice(0, 120) : String(a); }).join(' ');
      if (/angling/.test(s)) {
        var m = s.match(/angling\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/);
        if (m && (angCount % 5 === 0 || cap.frame - (cap.angling.length ? cap.angling[cap.angling.length - 1].f : -9) > 3)) cap.angling.push({ f: cap.frame, ms: Math.round(+m[1] * 100) / 100 });
        angCount++;
      } else if (cap.consoleAll.length < 400 && !/^--/.test(s.trim())) cap.consoleAll.push({ f: cap.frame, msg: s.slice(0, 200) });
    } catch (e) {}
    return origLog.apply(console, arguments);
  };
  function devSnap() {
    var d = {};
    (L.objects || []).forEach(function (x, i) {
      var t = x.options.type;
      if (t === 'timedpusher') { d.tp = { s: x.state, tr: Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4, tm: x.timer ? Math.round(x.timer.ms) : null }; }
      else if (t === 'pusher') { d['p' + i] = { s: x.state, tr: Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4 }; }
      else if (t === 'platform') { var p = x.body.data.GetPosition(); d['g' + i] = { s: x.state, tr: Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4, y: Math.round(-p.y * 32 * 100) / 100 }; }
    });
    return d;
  }
  function doorSnap() { return { door_fb: { open: !!L.door1.isOpen, up: !!L.door1.isUp }, door_wg: { open: !!L.door2.isOpen, up: !!L.door2.isUp } }; }

  function beginStep(Q, who, s) {
    Q.st = { t0: cap.frame, lastX: null, stall: 0, pulse: 0 };
    Q.log.push({ f: cap.frame, who: who, op: s.op, dir: s.dir, until: s.until, or: s.or, jumpAt: s.jumpAt });
  }
  function releaseAll(who) { setKey(who, 'up', false); setKey(who, 'left', false); setKey(who, 'right', false); }
  function tick(who) {
    var Q = q[who], s = Q.steps[Q.idx], st = Q.st;
    var c = pers(who);
    if (!c) return;
    if (c.isDead) { if (!Q.deadLogged) { cap.events.push({ f: cap.frame, kind: 'death', who: who }); Q.deadLogged = true; if (!cap.fatal) cap.fatal = { f: cap.frame, kind: 'death', who: who }; releaseAll(who); Q.idx = Q.steps.length; Q.st = null; } return; }
    var p = c.body.data.GetPosition(), x = -p.x * 32, y = -p.y * 32;
    var lv = c.body.data.GetLinearVelocity();
    Q.groundN = Math.abs(lv.y) < 0.05 ? Q.groundN + 1 : 0;
    if (s.op === 'place') { releaseAll(who); c.body.data.SetPosition(V(-s.x / 32, -s.y / 32)); c.body.data.SetLinearVelocity(V(0, 0)); c.body.data.SetAwake(!0); Q.idx++; Q.st = null; return; }
    if (s.op === 'waitf') { releaseAll(who); if (cap.frame - st.t0 >= s.f) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'stop') { releaseAll(who); if (cap.frame - st.t0 >= s.f) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'jump') { // 原生跳: 脉冲 up 3f
      if (st.pulse === 0) { st.pulse = 1; setKey(who, 'up', true); cap.events.push({ f: cap.frame, kind: 'jumpPulse', who: who, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, vy: Math.round(lv.y * 100) / 100 }); }
      else { st.pulse++; if (st.pulse >= 4) { setKey(who, 'up', false); Q.idx++; Q.st = null; } }
      return;
    }
    if (s.op === 'walk') {
      var dirKey = s.dir > 0 ? 'left' : 'right';
      // 三拍跳: T0 松方向键 -> T1 脉冲 up(此时已驻立) -> T3 释放 up+复按方向键
      if (st.phase === undefined) st.phase = 'run';
      if (st.phase === 'run') {
        setKey(who, dirKey, true);
        setKey(who, s.dir > 0 ? 'right' : 'left', false);
        if (st.lastX == null) st.lastX = x;
        if (Math.abs(x - st.lastX) < 0.5 && Math.abs(lv.y) < 0.5) st.stall++; else st.stall = 0;
        st.lastX = x;
        if (st.stall >= 18 && !st.jumped) { // 卡住(如楼梯趾) -> 原地三拍跳翻越
          st.jumped = true; st.phase = 'rel'; st.relT = 0; st.stall = -60;
          setKey(who, dirKey, false);
          cap.events.push({ f: cap.frame, kind: 'stallJump', who: who, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
        }
        var fire = false;
        if (s.jumpAt != null && ((s.dir > 0 && x <= s.jumpAt) || (s.dir < 0 && x >= s.jumpAt))) fire = true;
        if (s.jumpF != null && cap.frame - st.t0 >= s.jumpF) fire = true;
        if (fire && !st.jumped) {
          st.jumped = true; st.phase = 'rel'; st.relT = 0;
          setKey(who, dirKey, false);
          cap.events.push({ f: cap.frame, kind: 'jumpPrep', who: who, at: s.jumpAt != null ? s.jumpAt : ('F' + s.jumpF), x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, vx: Math.round(lv.x * 100) / 100 });
        }
      } else if (st.phase === 'rel') {
        setKey(who, 'left', false); setKey(who, 'right', false);
        st.relT++;
        var gnd = Math.abs(lv.y) < 0.5;
        var need = s.relF || 2;
        if ((st.relT >= need && gnd) || st.relT >= 15) { st.phase = 'pulse'; st.pulse = 0; }
      } else if (st.phase === 'pulse') {
        if (st.pulse === 0) { setKey(who, 'up', true); cap.events.push({ f: cap.frame, kind: 'jumpPulse', who: who, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, vy: Math.round(lv.y * 100) / 100, vx: Math.round(lv.x * 100) / 100, fn: c.feetSensor && c.feetSensor.contacts ? c.feetSensor.contacts.length : -1 }); }
        st.pulse++;
        if (st.pulse >= 3) { setKey(who, 'up', false); setKey(who, dirKey, true); st.phase = 'run2'; }
      } else if (st.phase === 'run2') {
        setKey(who, dirKey, true);
      }
      var done = false, why = null;
      if (s.until != null) { if (s.dir > 0 ? x <= s.until : x >= s.until) { done = true; why = 'until'; } }
      if (!done && s.or != null && cap.frame - st.t0 >= s.or) { done = true; why = 'budget'; }
      if (done) {
        releaseAll(who);
        cap.events.push({ f: cap.frame, kind: 'stepDone', who: who, why: why, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, gN: Q.groundN });
        Q.idx++; Q.st = null;
      }
      return;
    }
    Q.idx++; Q.st = null;
  }

  plugin.update = function () {
    var f = cap.frame;
    var QF = q.fb, QW = q.wg;
    if (QF.idx < QF.steps.length && !QF.st) beginStep(QF, 'fb', QF.steps[QF.idx]);
    if (QF.idx < QF.steps.length) tick('fb');
    if (QW.idx < QW.steps.length && !QW.st) beginStep(QW, 'wg', QW.steps[QW.idx]);
    if (QW.idx < QW.steps.length) tick('wg');
    var dt = 1 / 60; this.game.time.elapsed = dt * 1e3;
    origUpdate.call(this);
    var smp = { f: f };
    ['fb', 'wg'].forEach(function (who) {
      var c = pers(who);
      if (!c) return;
      var p = c.body.data.GetPosition();
      var lv = c.body.data.GetLinearVelocity();
      smp[who] = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, vx: Math.round(lv.x * 100) / 100, vy: Math.round(lv.y * 100) / 100, fn: c.feetSensor && c.feetSensor.contacts ? c.feetSensor.contacts.length : -1, ice: !!c.isOnIce, pj: !!c.prohibitJump };
    });
    var dv = devSnap();
    var ddoors = doorSnap();
    dv.door_fb = ddoors.door_fb; dv.door_wg = ddoors.door_wg;
    Object.keys(dv).forEach(function (k) {
      if (JSON.stringify(dv[k]) !== JSON.stringify(lastDev[k])) cap.devChanges.push({ f: f, k: k, v: dv[k] });
    });
    lastDev = dv;
    try { if (!cap.win && L.door1.isUp && L.door2.isUp) cap.win = { f: f, kind: 'bothDoorsUp' }; } catch (e) {}
    cap.samples.push(smp);
    cap.frame++;
    if (q.fb.idx >= q.fb.steps.length && q.wg.idx >= q.wg.steps.length) {
      if (cap.postN == null) cap.postN = (window.__postFrames || 0);
      else if (cap.postN-- <= 0) cap.done = true;
    }
    if (cap.win && cap.winHold == null) cap.winHold = (window.__winHold || 60);
    if (cap.win && cap.winHold-- <= 0) cap.done = true;
    if (f >= (window.__maxFrames || 900)) cap.done = true;
  };
})();`;

const FB_ROUTE = [
  { op: "place", x: 660, y: 253 },
  { op: "waitf", f: 30 },
  { op: "walk", dir: 1, jumpF: 6, relF: 4, until: 400, or: 320 },
  { op: "walk", dir: 1, jumpAt: 390, relF: 4, until: 150, or: 300 },
  { op: "walk", dir: 1, until: 88, or: 220 },
  { op: "stop", f: 8 },
  { op: "waitf", f: 240 },
];
const FB_CAL = [
  { op: "place", x: 1160, y: 265 }, { op: "waitf", f: 30 },
  { op: "place", x: 1160, y: 265 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 980, y: 253 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 900, y: 253 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 700, y: 253 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 500, y: 253 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 800, y: 157 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 416, y: 125 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 300, y: 125 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 600, y: 477 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 900, y: 445 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
  { op: "place", x: 300, y: 345 }, { op: "waitf", f: 26 }, { op: "jump" }, { op: "waitf", f: 66 },
];
const WG_PARK = [
  { op: "place", x: 410, y: 140 },
  { op: "waitf", f: 30 },
  { op: "walk", dir: 1, jumpAt: 398, relF: 4, until: 150, or: 300 },
  { op: "walk", dir: 1, until: 88, or: 220 },
  { op: "stop", f: 8 },
  { op: "waitf", f: 240 },
];

async function runScenario(browser, name, fbSteps, wgSteps, maxFrames) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log("[pageerror]", String(e).slice(0, 160)); });
  await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(400);
  // 运行时内省: char 控制字段
  const intros = await page.evaluate(`(function(){
    var L = require('Phaser').GAMES[0].level;
    function info(c){ if(!c) return null;
      return { keys: Object.keys(c).filter(function(k){return /jump|cursor|isOnIce|prohibit|feet|side/i.test(k);}),
        cursors: c.cursors ? Object.keys(c.cursors) : null,
        jumpVelocity: c.jumpVelocity, jumpIceVelocity: c.jumpIceVelocity, isOnIce: c.isOnIce, prohibitJump: c.prohibitJump,
        feetContacts: c.feetSensor && c.feetSensor.contacts ? c.feetSensor.contacts.length : null,
        charId: c.data && c.data.char }; }
    return { fb: info(L.pers1), wg: info(L.pers2) };
  })()`);
  console.log(`[${name}] intros:`, JSON.stringify(intros));
  await page.evaluate(`window.__stepsFB = ${JSON.stringify(fbSteps)}; window.__stepsWG = ${JSON.stringify(wgSteps)}; window.__maxFrames = ${maxFrames}; window.__postFrames = 30; window.__winHold = 120;`);
  await page.evaluate(INSTALL);
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 400000, polling: 100 });
  const rec = await page.evaluate("({frame: window.__rec.frame, samples: window.__rec.samples, devChanges: window.__rec.devChanges, events: window.__rec.events, qlog: window.__q, fatal: window.__rec.fatal, win: window.__rec.win, angling: window.__rec.angling, consoleAll: window.__rec.consoleAll})");
  console.log(`[${name}] frames=${rec.frame} fatal=${JSON.stringify(rec.fatal)} win=${JSON.stringify(rec.win)}`);
  console.log(`[${name}] events:`);
  rec.events.forEach((e) => console.log("  f" + e.f, JSON.stringify(e).slice(0, 200)));
  const key = rec.devChanges.filter((d) => ["tp", "g6", "door_fb", "door_wg"].includes(d.k));
  console.log(`[${name}] tp milestones:`);
  let lastS = null;
  key.filter((d) => d.k === "tp").forEach((d) => { if (d.v.s !== lastS) { console.log("  f" + d.f, JSON.stringify(d.v)); lastS = d.v.s; } });
  const tpAll = key.filter((d) => d.k === "tp");
  console.log(`[${name}] tp last:`, JSON.stringify(tpAll.slice(-2)));
  console.log(`[${name}] doors:`, key.filter((d) => d.k.startsWith("door")).map((d) => `f${d.f} ${d.k}=${JSON.stringify(d.v)}`).join(" | ") || "(none)");
  try { await page.screenshot({ path: `${SHOT_DIR}/p3-${name}.png` }); } catch {}
  await page.close();
  return rec;
}

async function main() {
  const srv = await startServer();
  console.log(`[serve] ${ROOT} @ http://127.0.0.1:${PORT}/gameIndex.html`);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const cal = await runScenario(browser, "S1-pool", FB_ROUTE, [{ op: "place", x: 1128, y: 285 }, { op: "waitf", f: 2500 }], 1600);
  const route = await runScenario(browser, "S2-final", [{ op: "place", x: 1128, y: 285 }, { op: "waitf", f: 2500 }], WG_PARK, 1600);
  await browser.close();
  try { srv.closeAllConnections && srv.closeAllConnections(); } catch {}
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify({ S1: cal, S2: route }, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

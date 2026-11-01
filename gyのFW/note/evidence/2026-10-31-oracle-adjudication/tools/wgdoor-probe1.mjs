// wgdoor-probe1.mjs — crystal_03 wg 门可达性 oracle 终审 · 第 1 步
// E0: live oracle 全量几何 dump（groundBody 全 fixture + 全 device + 门 sensor，修补 probe1-dump 手选 region 缺口）
// E1: 正向分离实验——wg 预置西舱内各采样点 → 行走 → door2.isOpen/isUp 时间线
// E2: fb 预置自家门 → door1；双角色各就位 → checkEndGame → WIN 正控
// 伺服: 内嵌 http 127.0.0.1:8876 ROOT=Fireboy-and-Watergirl/output/D 严格只读，收尾关闭。
// 坐标: world = -screen/32（01号档头部约定）；本文/本档所有坐标均 screen 系。
// 产出: tools/artifacts/wgdoor-1-out.json；截图 TEMP/fw-oc-wg-1/。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8876;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/D";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-31-oracle-adjudication/tools/artifacts/wgdoor-1-out.json";
const SHOT_DIR = "/home/gy/桌面/dev/slbhr/TEMP/fw-oc-wg-1";

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
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'crystal'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/crystal_03.json') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename };
})()`;

// E0: 全量静态 dump（在 INSTALL 之前的独立 evaluate；只读遍历）
const DUMP = `(function () {
  var g = require('Phaser').GAMES[0], L = g.level, out = { grounds: [], devices: [], doors: [], chars: [], meta: {} };
  function sx(v) { return Math.round(-v * 32 * 100) / 100; }
  function dumpBody(b, tag, dst) {
    for (var f = b.GetFixtureList(); f; f = f.GetNext()) {
      var ud;
      try { ud = typeof f.m_userData === 'object' ? JSON.stringify(f.m_userData).slice(0, 120) : String(f.m_userData); } catch (e) { ud = Object.keys(f.m_userData || {}).join(',') || '(circular)'; }
      var sh = f.GetShape(), ent = { tag: tag, sensor: f.IsSensor(), ud: ud, filter: { cat: f.GetFilterData().categoryBits, mask: f.GetFilterData().maskBits } };
      if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
        ent.vertsScreen = sh.m_vertices.map(function (v) { var w = b.GetPointWorld ? b.GetPointWorld(v) : null; return { x: sx((w || v).x), y: sx((w || v).y) }; });
        if (!b.GetPointWorld) ent.vertsScreen = ent.vertsScreen.map(function (p) { return p; });
      } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape) {
        var c = sh.m_p, w = b.GetWorldPoint(c);
        ent.circleScreen = { cx: sx(w.x), cy: sx(w.y), r: Math.round(sh.m_radius * 32 * 100) / 100 };
      } else ent.shapeType = String(sh.GetType());
      dst.push(ent);
    }
  }
  // ground（tile 拼合体）: L.groundBody 是 b2Body.data
  dumpBody(L.groundBody, 'ground', out.grounds);
  // world bounds
  try {
    var wb = g.physics.box2d.boundsBodies || [];
    out.meta.boundsBodies = wb.length;
  } catch (e) {}
  // devices
  (L.objects || []).forEach(function (o) {
    var d = { type: o.options.type, props: o.options.properties, posScreen: { x: o.options.x + (o.options.width || 0) / 2, y: o.options.y + (o.options.height || 0) / 2 }, state: o.state };
    if (o.options.type === 'portal') {
      d.centerScreen = { x: Math.round(-o.body.data.GetPosition().x * 32 * 100) / 100, y: Math.round(-o.body.data.GetPosition().y * 32 * 100) / 100 };
      d.inverted = o.options.properties.inverted; d.portalId = o.options.properties.portalId;
      d.fixtures = [];
      dumpBody(o.body.data, o.options.type, d.fixtures);
      d.otherIdx = o.other ? (L.objects || []).indexOf(o.other) : null;
    }
    if (o.options.type === 'platform') {
      d.bodyScreen = { x: Math.round(-o.body.data.GetPosition().x * 32 * 100) / 100, y: Math.round(-o.body.data.GetPosition().y * 32 * 100) / 100 };
      d.tr = o.joint.GetJointTranslation();
      d.fixtures = [];
      dumpBody(o.body.data, 'platform', d.fixtures);
    }
    if (o.options.type === 'door') {
      d.char = o.options.properties.character;
      d.bodyScreen = { x: Math.round(-o.body.data.GetPosition().x * 32 * 100) / 100, y: Math.round(-o.body.data.GetPosition().y * 32 * 100) / 100 };
      d.isOpen = o.isOpen; d.isUp = o.isUp;
      d.fixtures = [];
      dumpBody(o.body.data, 'door-' + d.char, d.fixtures);
    }
    out.devices.push(d);
  });
  ['pers1', 'pers2'].forEach(function (k) {
    var c = L[k];
    out.chars.push({ k: k, char: c.data.char, originScreen: { x: Math.round(-c.body.data.GetPosition().x * 32 * 100) / 100, y: Math.round(-c.body.data.GetPosition().y * 32 * 100) / 100 }, dims: { r1: c.r1, r2: c.r2, dr: c.dr, y1: c.y1, y2: c.y2, maxSpeed: c.defaultMaxSpeed, jumpVelocity: c.jumpVelocity, spriteScale: c.spriteScale } });
  });
  out.meta.mapW = 39 * 32; out.meta.mapH = 29 * 32;
  return out;
})()`;

// 双角色解释器 v1：ops = place/walk/waitf/jump；walk 支持 until/settle/untilDoor/or(budget)/jumpAt/stallJump/spd
const INSTALL = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  var V = function (x, y) { return new box2d.b2Vec2(x, y); };
  var pers = function (k) { return k === 'wg' ? L.pers2 : L.pers1; };
  var q = {
    fb: { steps: window.__stepsFB || [], idx: 0, st: null, log: [], groundN: 0 },
    wg: { steps: window.__stepsWG || [], idx: 0, st: null, log: [], groundN: 0 },
  };
  window.__q = q;
  window.__rec = { frame: 0, samples: [], events: [], done: false, fatal: null, win: null, logs: [] };
  var cap = window.__rec;
  var lastPos = {}, lastDev = {};
  // console.log 捕获（portal 'prevented transport...' / 'side violation!'）
  var origLog = console.log;
  console.log = function () {
    try {
      var s = Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a).slice(0, 200) : String(a); }).join(' ');
      if (/transport|side violation/.test(s)) cap.logs.push({ f: cap.frame, msg: s.slice(0, 240) });
    } catch (e) {}
    return origLog.apply(console, arguments);
  };
  // portal.transport 包装
  (L.objects || []).forEach(function (o) {
    if (o.options.type !== 'portal') return;
    var orig = o.transport.bind(o);
    o.transport = function (a) {
      var p = a.body.data.GetPosition();
      var from = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100 };
      orig(a);
      var p2 = a.body.data.GetPosition();
      cap.events.push({ f: cap.frame, kind: 'transport', who: a.body.data.m_userData === 'pers' ? (a.body === L.pers1.body.data ? 'fb' : (a.body === L.pers2.body.data ? 'wg' : 'other')) : String(a.body.data.m_userData), portal: (L.objects || []).indexOf(o), from: from, to: { x: Math.round(-p2.x * 32 * 100) / 100, y: Math.round(-p2.y * 32 * 100) / 100 }, vel: { x: Math.round(a.body.data.GetLinearVelocity().x * 100) / 100, y: Math.round(a.body.data.GetLinearVelocity().y * 100) / 100 } });
    };
    o.__portalIdx = (L.objects || []).indexOf(o);
  });

  function devSnap() {
    var d = {};
    (L.objects || []).forEach(function (x) {
      var t = x.options.type;
      if (t === 'lever') d.lever = x.state;
      if (t === 'pusher') { d.pusher = x.state; try { d.pusherTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
      if (t === 'platform') { d.platTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; }
      if (t === 'box') { var bp = x.body.data.GetPosition(); d.box = { x: Math.round(-bp.x * 32 * 100) / 100, y: Math.round(-bp.y * 32 * 100) / 100 }; }
      if (t === 'door') { var dd = d['door_' + x.options.properties.character] || (d['door_' + x.options.properties.character] = {}); dd.open = !!x.isOpen; dd.up = !!x.isUp; }
      // 注: oracle 门设备不在 L.objects（dbg: types 仅 lever/box/pusher/platform/portal），门在 L.door1(fb)/L.door2(wg)
      if (t === 'portal') { var pk = 'p' + (L.objects || []).indexOf(x); d[pk] = { near: Object.keys(x.nearBodies || {}).length, recv: !!x.receiving, tpq: x.transporting ? x.transporting.length : 0 }; }
    });
    return d;
  }
  function doorSnap() { try { return { door_fb: { open: !!L.door1.isOpen, up: !!L.door1.isUp }, door_wg: { open: !!L.door2.isOpen, up: !!L.door2.isUp } }; } catch (e) { return {}; } }
  function grounded(c) { var vy = c.body.data.GetLinearVelocity().y; return Math.abs(vy) < 0.05; }

  function beginStep(Q, who, s) {
    Q.st = { t0: cap.frame, lastX: null, stall: 0, jumped: false, holdN: 0 };
    Q.log.push({ f: cap.frame, who: who, op: s.op, dir: s.dir, until: s.until, settle: s.settle, untilDoor: s.untilDoor, jumpAt: s.jumpAt, spd: s.spd });
  }
  function tick(who) {
    var Q = q[who], s = Q.steps[Q.idx], st = Q.st;
    var c = pers(who);
    if (!c) return;
    if (c.isDead) { if (!Q.deadLogged) { cap.events.push({ f: cap.frame, kind: 'death', who: who }); Q.deadLogged = true; if (!cap.fatal) cap.fatal = { f: cap.frame, kind: 'death', who: who }; Q.idx = Q.steps.length; Q.st = null; } return; }
    var p = c.body.data.GetPosition(), x = -p.x * 32, y = -p.y * 32;
    Q.groundN = grounded(c) ? Q.groundN + 1 : 0;
    if (s.op === 'place') { c.body.data.SetPosition(V(-s.x / 32, -s.y / 32)); c.body.data.SetLinearVelocity(V(0, 0)); c.body.data.SetAwake(!0); Q.idx++; Q.st = null; return; }
    if (s.op === 'waitf') { if (cap.frame - st.t0 >= s.f) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'jump') { c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, s.vy || -15.5)); cap.events.push({ f: cap.frame, kind: 'jump', who: who, vy: s.vy || -15.5 }); Q.idx++; Q.st = null; return; }
    if (s.op === 'walk') {
      var done = false, why = null;
      if (s.jumpAt != null && !st.jumped && ((s.dir > 0 && x <= s.jumpAt) || (s.dir < 0 && x >= s.jumpAt))) {
        c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, s.jvy || -15.5)); st.jumped = true;
        cap.events.push({ f: cap.frame, kind: 'jumpAt', who: who, at: s.jumpAt, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
      }
      if (st.lastX == null) st.lastX = x;
      var moved = Math.abs(x - st.lastX) > 0.6; st.lastX = x;
      if (s.stallJump && !moved) st.stall++; else st.stall = 0;
      if (s.stallJump && st.stall >= 22) { c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, s.jvy || -15.5)); st.stall = -30; cap.events.push({ f: cap.frame, kind: 'stallJump', who: who, x: Math.round(x * 100) / 100 }); }
      c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(s.dir * (s.spd || 8.5), c.body.data.GetLinearVelocity().y));
      var dv = devSnap();
      var ddoors = doorSnap();
      if (ddoors.door_fb) { dv.door_fb = ddoors.door_fb; dv.door_wg = ddoors.door_wg; }
      if (s.until != null) { if (s.dir > 0 ? x <= s.until : x >= s.until) { done = true; why = 'until'; } }
      if (!done && s.untilDoor != null) { var dd = dv['door_' + (who === 'wg' ? 'wg' : 'fb')]; if (dd && (s.untilDoor === 'open' ? dd.open : dd.up)) { done = true; why = 'untilDoor:' + s.untilDoor; } }
      if (!done && s.settle) { if (Q.groundN >= s.settle.g && y >= s.settle.y0 && y <= s.settle.y1) { done = true; why = 'settle'; } }
      if (!done && s.or != null && cap.frame - st.t0 >= s.or) { done = true; why = 'budget'; }
      if (done) {
        if (s.holdF) { st.holdN++; if (st.holdN <= s.holdF) return; }
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
      smp[who] = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, vx: Math.round(lv.x * 100) / 100, vy: Math.round(lv.y * 100) / 100, awake: c.body.data.IsAwake() };
      var lp = lastPos[who];
      if (lp) { var dx = smp[who].x - lp.x, dy = smp[who].y - lp.y; if (Math.abs(dx) > 30 || Math.abs(dy) > 30) cap.events.push({ f: f, kind: 'tp?', who: who, from: lp, to: smp[who] }); }
      lastPos[who] = { x: smp[who].x, y: smp[who].y };
    });
    var dv = devSnap();
    var ddoors = doorSnap();
    if (ddoors.door_fb) { dv.door_fb = ddoors.door_fb; dv.door_wg = ddoors.door_wg; }
    ['lever', 'pusher', 'pusherTr', 'platTr', 'door_fb', 'door_wg'].forEach(function (k) { if (dv[k] !== undefined) smp[k] = dv[k]; });
    ['p6', 'p7', 'p10', 'p11'].forEach(function (k) { if (dv[k] !== undefined && (dv[k].near || dv[k].recv || dv[k].tpq)) smp[k] = dv[k]; });
    ['lever', 'pusher', 'platTr'].forEach(function (k) {
      if (lastDev[k] !== undefined && dv[k] !== undefined && dv[k] !== lastDev[k]) cap.events.push({ f: f, kind: 'dev', k: k, from: lastDev[k], to: dv[k] });
    });
    lastDev = { lever: dv.lever, pusher: dv.pusher, platTr: dv.platTr };
    // WIN 检测：checkEndGame → box2d.paused + level.ended
    try {
      if (g.physics.box2d.paused === true && L.ended && !cap.win) cap.win = { f: f, kind: 'ended+paused' };
    } catch (e) {}
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

const SCEN = [
  {
    name: "S1_wg_in_chamber_96",
    maxF: 400, post: 0,
    fb: [], wg: [
      { op: "place", x: 96, y: 216 },
      { op: "waitf", f: 40 },
      { op: "walk", dir: -1, until: 92, or: 60 },
      { op: "waitf", f: 120 },
    ],
  },
  {
    name: "S2_wg_chamber_240_walkW_to_door",
    maxF: 500, post: 0,
    fb: [], wg: [
      { op: "place", x: 240, y: 216 },
      { op: "waitf", f: 20 },
      { op: "walk", dir: 1, until: 96, or: 220 },
      { op: "waitf", f: 130 },
    ],
  },
  {
    name: "S3_fb_at_own_door",
    maxF: 300, post: 0,
    fb: [
      { op: "place", x: 460, y: 216 },
      { op: "waitf", f: 130 },
    ], wg: [],
  },
  {
    name: "S4_both_doors_WIN_control",
    maxF: 500, post: 40, winHold: 90,
    fb: [
      { op: "place", x: 460, y: 216 },
      { op: "waitf", f: 200 },
    ], wg: [
      { op: "place", x: 96, y: 216 },
      { op: "waitf", f: 200 },
    ],
  },
];

async function main() {
  const srv = await startServer();
  console.log(`[serve] ${ROOT} @ http://127.0.0.1:${PORT}/gameIndex.html`);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log("[pageerror]", String(e).slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });

  const results = {};
  // E0 静态 dump（一次）
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(400);
  results.staticDump = await page.evaluate(DUMP);
  const gcount = results.staticDump.grounds.length;
  console.log(`[E0] ground fixtures=${gcount} devices=${results.staticDump.devices.length}`);

  for (const sc of SCEN) {
    await page.evaluate(NAVIGATE);
    await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
    await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(400);
    await page.evaluate(`window.__stepsFB = ${JSON.stringify(sc.fb)}; window.__stepsWG = ${JSON.stringify(sc.wg)}; window.__maxFrames = ${sc.maxF}; window.__postFrames = ${sc.post || 0}; window.__winHold = ${sc.winHold || 60};`);
    await page.evaluate(INSTALL);
    await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 180000, polling: 100 });
    const rec = await page.evaluate("({frame: window.__rec.frame, samples: window.__rec.samples, events: window.__rec.events, qlog: window.__q, fatal: window.__rec.fatal, win: window.__rec.win, logs: window.__rec.logs})");
    results[sc.name] = rec;
    console.log(`== ${sc.name}: frames=${rec.frame} fatal=${JSON.stringify(rec.fatal)} win=${JSON.stringify(rec.win)}`);
    for (const e of rec.events) console.log(`   f${e.f}`, JSON.stringify(e).slice(0, 240));
    if (rec.logs.length) console.log(`   logs:`, JSON.stringify(rec.logs.slice(0, 12)));
    const last = rec.samples[rec.samples.length - 1];
    console.log(`   last: ${JSON.stringify(last)}`);
    try { await page.screenshot({ path: `${SHOT_DIR}/wgdoor1-${sc.name}.png` }); } catch {}
  }
  await browser.close();
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

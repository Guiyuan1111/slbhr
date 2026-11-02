// oracle-ice02-p2-timer.mjs — ice_02 oracle 取证 · 第 2 步：t0 TimedPusher 计时语义 + 按钮→滑台动作窗
// 场景:
//   A_hold     踏上踏板后长期站立 → 闸门是否一直保持升起（按住续表 vs 一次性首压 的直接裁决）
//   B_release  踏上→走离 → 落闸帧相对 松开/首压 的偏移（240f vs 390f 判别）
//   C_repress  踏上→走离→再踏→走离 → 再压是否重置/延长（可再臂性）
//   E_mech     压 pusher16(group1)→滑台 p0 动作窗；压 pusher17(group3)→滑台 p1 动作窗；控制台全量捕获（融/冻日志）
// 采样: 每帧双角色 pos/vel + 全 device (state,tr) 变化 + t0 timerMs + angling console（state1 期间每帧打印 timer.ms）
// 产出: tools/artifacts/oracle-ice02-p2-timer-out.json
import { chromium } from "playwright";
import { writeFileSync, createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8877;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/C";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-25-ice-temple/tools/artifacts/oracle-ice02-p2-timer-out.json";
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
  var q = {
    fb: { steps: window.__stepsFB || [], idx: 0, st: null, log: [], groundN: 0 },
    wg: { steps: window.__stepsWG || [], idx: 0, st: null, log: [], groundN: 0 },
  };
  window.__q = q;
  window.__rec = { frame: 0, samples: [], devChanges: [], events: [], done: false, fatal: null, win: null, angling: [], consoleAll: [] };
  var cap = window.__rec;
  var lastDev = {}, lastDoor = {};
  var angCount = 0;
  var origLog = console.log;
  console.log = function () {
    try {
      var s = Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a).slice(0, 120) : String(a); }).join(' ');
      if (/angling/.test(s)) {
        var m = s.match(/angling\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/);
        if (m && (angCount % 5 === 0 || cap.angling.length === 0 || cap.frame - cap.angling[cap.angling.length - 1].f > 3)) cap.angling.push({ f: cap.frame, ms: Math.round(+m[1] * 100) / 100 });
        angCount++;
      } else if (cap.consoleAll.length < 400) cap.consoleAll.push({ f: cap.frame, msg: s.slice(0, 200) });
      if (/transport|side violation/.test(s)) cap.events.push({ f: cap.frame, kind: 'englog', msg: s.slice(0, 240) });
    } catch (e) {}
    return origLog.apply(console, arguments);
  };
  function devSnap() {
    var d = {};
    (L.objects || []).forEach(function (x, i) {
      var t = x.options.type;
      if (t === 'timedpusher') { d['tp'] = { s: x.state, tr: Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4, tm: x.timer ? Math.round(x.timer.ms * 100) / 100 : null }; }
      else if (t === 'pusher') { d['p' + i] = { s: x.state, tr: Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4 }; }
      else if (t === 'platform') { var p = x.body.data.GetPosition(); d['g' + i] = { s: x.state, tr: Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4, y: Math.round(-p.y * 32 * 100) / 100, x: Math.round(-p.x * 32 * 100) / 100 }; }
    });
    return d;
  }
  function doorSnap() { return { door_fb: { open: !!L.door1.isOpen, up: !!L.door1.isUp }, door_wg: { open: !!L.door2.isOpen, up: !!L.door2.isUp } }; }
  function grounded(c) { var vy = c.body.data.GetLinearVelocity().y; return Math.abs(vy) < 0.05; }

  function beginStep(Q, who, s) {
    Q.st = { t0: cap.frame, lastX: null, stall: 0 };
    Q.log.push({ f: cap.frame, who: who, op: s.op, dir: s.dir, until: s.until, or: s.or, jumpAt: s.jumpAt, spd: s.spd });
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
      if (s.until != null) { if (s.dir > 0 ? x <= s.until : x >= s.until) { done = true; why = 'until'; } }
      if (!done && s.or != null && cap.frame - st.t0 >= s.or) { done = true; why = 'budget'; }
      if (done) {
        if (s.holdF) { st.holdN = (st.holdN || 0) + 1; if (st.holdN <= s.holdF) return; }
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
      smp[who] = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, vx: Math.round(lv.x * 100) / 100, vy: Math.round(lv.y * 100) / 100 };
    });
    var dv = devSnap();
    var ddoors = doorSnap();
    if (ddoors.door_fb) { dv.door_fb = ddoors.door_fb; dv.door_wg = ddoors.door_wg; }
    Object.keys(dv).forEach(function (k) {
      if (JSON.stringify(dv[k]) !== JSON.stringify(lastDev[k])) cap.devChanges.push({ f: f, k: k, v: dv[k] });
    });
    lastDev = dv;
    smp.tp = dv.tp ? [dv.tp.s, dv.tp.tr, dv.tp.tm] : undefined;
    smp.g6 = dv.g6 ? [dv.g6.s, dv.g6.tr, dv.g6.y] : undefined;
    try { if (g.physics.box2d.paused === true && L.ended && !cap.win) cap.win = { f: f, kind: 'ended+paused' }; } catch (e) {}
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
    name: "A_hold_on_pedal_stay",
    maxF: 1100, post: 0,
    fb: [
      { op: "place", x: 1168, y: 250 },
      { op: "waitf", f: 60 },
      { op: "walk", dir: -1, until: 1180, or: 60 },
      { op: "waitf", f: 850 },
    ], wg: [],
  },
  {
    name: "B_press_then_release",
    maxF: 1100, post: 0,
    fb: [
      { op: "place", x: 1168, y: 250 },
      { op: "waitf", f: 60 },
      { op: "walk", dir: -1, until: 1180, or: 60 },
      { op: "walk", dir: 1, until: 1112, or: 200 },
      { op: "waitf", f: 700 },
    ], wg: [],
  },
  {
    name: "C_press_release_repress_release",
    maxF: 1500, post: 0,
    fb: [
      { op: "place", x: 1168, y: 250 },
      { op: "waitf", f: 60 },
      { op: "walk", dir: -1, until: 1180, or: 60 },
      { op: "walk", dir: 1, until: 1112, or: 200 },
      { op: "waitf", f: 120 },
      { op: "walk", dir: -1, until: 1175, or: 260, stallJump: true },
      { op: "walk", dir: 1, until: 1112, or: 200 },
      { op: "waitf", f: 700 },
    ], wg: [],
  },
  {
    name: "E_mech_button_sliders",
    maxF: 1000, post: 0,
    fb: [
      { op: "place", x: 960, y: 477 },
      { op: "waitf", f: 150 },
      { op: "walk", dir: 1, until: 880, or: 200 },
      { op: "waitf", f: 100 },
    ], wg: [
      { op: "place", x: 128, y: 701 },
      { op: "waitf", f: 400 },
      { op: "walk", dir: -1, until: 200, or: 200 },
      { op: "waitf", f: 100 },
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
  for (const sc of SCEN) {
    await page.evaluate(NAVIGATE);
    await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
    await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(400);
    await page.evaluate(`window.__stepsFB = ${JSON.stringify(sc.fb)}; window.__stepsWG = ${JSON.stringify(sc.wg)}; window.__maxFrames = ${sc.maxF}; window.__postFrames = ${sc.post || 0}; window.__winHold = ${sc.winHold || 60};`);
    await page.evaluate(INSTALL);
    await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 300000, polling: 100 });
    const rec = await page.evaluate("({frame: window.__rec.frame, samples: window.__rec.samples, devChanges: window.__rec.devChanges, events: window.__rec.events, qlog: window.__q, fatal: window.__rec.fatal, win: window.__rec.win, angling: window.__rec.angling, consoleAll: window.__rec.consoleAll})");
    results[sc.name] = rec;
    console.log(`== ${sc.name}: frames=${rec.frame} fatal=${JSON.stringify(rec.fatal)} win=${JSON.stringify(rec.win)}`);
    const dc = rec.devChanges.filter((d) => d.k === "tp" || d.k === "g6" || d.k.startsWith("p") || (d.v && typeof d.v === "object" && ("s" in d.v)));
    console.log("   devChanges(t0/gate/pushers):", dc.filter(d => d.k === "tp" || d.k === "g6" || /^p\d/.test(d.k)).map((d) => `f${d.f} ${d.k}=${JSON.stringify(d.v)}`).join(" | ").slice(0, 1200));
    console.log("   gate g6 changes:", rec.devChanges.filter(d => d.k === "g6").map(d => `f${d.f}=${JSON.stringify(d.v)}`).join(" | ").slice(0, 800));
    const ang = rec.angling;
    if (ang.length) {
      console.log(`   angling: n=${ang.length} first f${ang[0].f} ms=${ang[0].ms} last f${ang[ang.length - 1].f} ms=${ang[ang.length - 1].ms}`);
      const dms = ang.slice(1, 12).map((a, i) => Math.round((a.ms - ang[i].ms) * 100) / 100);
      console.log("   ms-per-frame(sample):", dms.join(","));
    }
    if (rec.consoleAll.length) console.log("   console(n0-8):", rec.consoleAll.slice(0, 8).map(c => `f${c.f}:${c.msg}`).join(" § ").slice(0, 600));
    try { await page.screenshot({ path: `${SHOT_DIR}/p2-${sc.name}.png` }); } catch {}
  }
  await browser.close();
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

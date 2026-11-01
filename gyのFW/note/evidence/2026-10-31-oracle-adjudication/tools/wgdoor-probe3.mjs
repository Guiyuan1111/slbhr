// wgdoor-probe3.mjs — crystal_03 wg 门可达性 oracle 终审 · 第 3 步
// R3f : 冷却窗破壁（修正符号版）：板西段东行入 P6 条带 → P7 东出口落地 → 同帧反身西行穿条带
// R7  : 自然路线连接件——row18 东段上浮楔 (320,448)-(352,480) → 448 板东段 → 西行条带入舱 → 门
// R1c : R1a 复跑 ×2（落点相位方差界，04号档 §3.3.3 Q3）
// QA/QB/QC: 04号档 §3.3 Q1/Q2——734.08 升降柱钉位机理（tr 状态）+ 钉位静止冻结机理（vx 读数 vs 位移）
// 伺服: 内嵌 http 127.0.0.1:8876 ROOT=Fireboy-and-Watergirl/output/D 只读，收尾关闭。
// 产出: tools/artifacts/wgdoor-3-out.json
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8876;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/D";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-31-oracle-adjudication/tools/artifacts/wgdoor-3-out.json";
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
  var lastTpFrame = { fb: -9999, wg: -9999 };
  var origLog = console.log;
  console.log = function () {
    try {
      var s = Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a).slice(0, 200) : String(a); }).join(' ');
      if (/transport|side violation/.test(s)) cap.logs.push({ f: cap.frame, msg: s.slice(0, 240) });
    } catch (e) {}
    return origLog.apply(console, arguments);
  };
  (L.objects || []).forEach(function (o) {
    if (o.options.type !== 'portal') return;
    var orig = o.transport.bind(o);
    o.transport = function (a) {
      var p = a.body.data.GetPosition();
      var from = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100 };
      var isFb = L.pers1.body.data.GetFixtureList() === a.body || true;
      var who = 'unknown';
      try { who = (a.body === L.pers1.body.data.GetFixtureList().m_body) ? 'fb' : who; } catch (e) {}
      try { who = (a.body.GetBody && a.body.GetBody() === L.pers1.body.data) ? 'fb' : (a.body.GetBody && a.body.GetBody() === L.pers2.body.data) ? 'wg' : who; } catch (e) {}
      orig(a);
      var p2 = a.body.data.GetPosition();
      var who2 = 'unknown';
      try { who2 = (a.body.GetBody() === L.pers1.body.data) ? 'fb' : (a.body.GetBody() === L.pers2.body.data) ? 'wg' : 'box/other'; } catch (e) {}
      if (who2 !== 'box/other') lastTpFrame[who2] = cap.frame;
      cap.events.push({ f: cap.frame, kind: 'transport', who: who2, portal: (L.objects || []).indexOf(o), from: from, to: { x: Math.round(-p2.x * 32 * 100) / 100, y: Math.round(-p2.y * 32 * 100) / 100 }, vel: { x: Math.round(a.body.data.GetLinearVelocity().x * 100) / 100, y: Math.round(a.body.data.GetLinearVelocity().y * 100) / 100 } });
    };
  });

  function devSnap() {
    var d = {};
    (L.objects || []).forEach(function (x) {
      var t = x.options.type;
      if (t === 'lever') d.lever = x.state;
      if (t === 'pusher') { d.pusher = x.state; try { d.pusherTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
      if (t === 'platform') { d.platTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; }
      if (t === 'portal') { var pk = 'p' + (L.objects || []).indexOf(x); var nb = Object.keys(x.nearBodies || {}).length; if (nb || x.receiving || x.transporting) d[pk] = { near: nb, recv: !!x.receiving, tpq: x.transporting ? x.transporting.length : 0 }; }
    });
    return d;
  }
  function doorSnap() { try { return { door_fb: { open: !!L.door1.isOpen, up: !!L.door1.isUp }, door_wg: { open: !!L.door2.isOpen, up: !!L.door2.isUp } }; } catch (e) { return {}; } }
  function grounded(c) { var vy = c.body.data.GetLinearVelocity().y; return Math.abs(vy) < 0.05; }

  function beginStep(Q, who, s) {
    Q.st = { t0: cap.frame, lastX: null, stall: 0, jumped: false, holdN: 0, phase: 0 };
    Q.log.push({ f: cap.frame, who: who, op: s.op, dir: s.dir, until: s.until, jumpAt: s.jumpAt, spd: s.spd, vx0: s.vx0, vx1: s.vx1 });
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
      var dv = devSnap(); var dd = doorSnap();
      if (s.until != null) { if (s.dir > 0 ? x <= s.until : x >= s.until) { done = true; why = 'until'; } }
      if (!done && s.untilDoor != null) { var door = dd['door_' + who]; if (door && (s.untilDoor === 'open' ? door.open : door.up)) { done = true; why = 'untilDoor:' + s.untilDoor; } }
      if (!done && s.settle) { if (Q.groundN >= s.settle.g && y >= s.settle.y0 && y <= s.settle.y1) { done = true; why = 'settle'; } }
      if (!done && s.or != null && cap.frame - st.t0 >= s.or) { done = true; why = 'budget'; }
      if (done) {
        if (s.holdF) { st.holdN++; if (st.holdN <= s.holdF) return; }
        cap.events.push({ f: cap.frame, kind: 'stepDone', who: who, why: why, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, gN: Q.groundN });
        Q.idx++; Q.st = null;
      }
      return;
    }
    if (s.op === 'crack') {
      // 阶段0: 以 vx0 行进逼近条带；transport 触发即转阶段1: 以 vx1 反向穿行（ vx 单位=world，屏幕西为正）
      if (st.phase === 0) {
        c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(s.vx0, c.body.data.GetLinearVelocity().y));
        if (lastTpFrame[who] >= cap.frame - 1) {
          st.phase = 1; st.t1 = cap.frame;
          cap.events.push({ f: cap.frame, kind: 'crack-phase1', who: who, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
        }
        if (cap.frame - st.t0 >= (s.or || 260)) { cap.events.push({ f: cap.frame, kind: 'stepDone', who: who, why: 'crack-noTp', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }); Q.idx++; Q.st = null; }
        return;
      }
      c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(s.vx1, c.body.data.GetLinearVelocity().y));
      var through = s.vx1 > 0 ? x <= (s.westUntil || 150) : x >= (s.eastUntil || 320);
      if (through) { cap.events.push({ f: cap.frame, kind: 'stepDone', who: who, why: 'crack-through', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }); Q.idx++; Q.st = null; return; }
      if (cap.frame - st.t1 >= (s.or2 || 320)) { cap.events.push({ f: cap.frame, kind: 'stepDone', who: who, why: 'crack-budget', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }); Q.idx++; Q.st = null; }
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
    var dv = devSnap(); var ddoors = doorSnap();
    dv.door_fb = ddoors.door_fb; dv.door_wg = ddoors.door_wg;
    ['lever', 'pusher', 'pusherTr', 'platTr', 'door_fb', 'door_wg'].forEach(function (k) { if (dv[k] !== undefined) smp[k] = dv[k]; });
    ['p10', 'p11'].forEach(function (k) { if (dv[k] !== undefined) smp[k] = dv[k]; });
    ['lever', 'pusher', 'platTr'].forEach(function (k) {
      if (lastDev[k] !== undefined && dv[k] !== undefined && dv[k] !== lastDev[k]) cap.events.push({ f: f, kind: 'dev', k: k, from: lastDev[k], to: dv[k] });
    });
    lastDev = { lever: dv.lever, pusher: dv.pusher, platTr: dv.platTr };
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
})();

// crack 语义注记: vx 单位为 world（world +x = 屏幕西）。阶段0 vx0=-8.5 = 屏幕东行。
`;

const SCEN = [
  // R3f: 板西段 (240,408) 东行(vx0=-8.5)入 P6 条带 → P7 东出口 → 同帧反身西行(vx1=+8.5)穿 P7 条带
  {
    name: "R3f_crack_walk",
    maxF: 800, post: 0,
    fb: [],
    wg: [
      { op: "place", x: 240, y: 408 },
      { op: "waitf", f: 20 },
      { op: "crack", vx0: -8.5, vx1: 8.5, westUntil: 150, or: 260, or2: 360 },
      { op: "waitf", f: 80 },
    ],
  },
  {
    name: "R3g_crack_sprint",
    maxF: 800, post: 0,
    fb: [],
    wg: [
      { op: "place", x: 210, y: 408 },
      { op: "waitf", f: 20 },
      { op: "crack", vx0: -42, vx1: 42, westUntil: 150, or: 220, or2: 360 },
      { op: "waitf", f: 80 },
    ],
  },
  // R7: 自然路线连接件——row18 (380,540.8) 西行慢速起跳 → 上浮楔/板东段 → 续西行条带入舱 → 门
  ...[
    [4, 378, false], [4, 368, false], [2.5, 380, false], [8.5, 388, false], [4, 378, true], [6, 374, false], [4, 358, false], [4, 348, false],
  ].map(([spd, ja, sj], i) => ({
    name: `R7_w${i}_spd${spd}_ja${ja}${sj ? "_sj" : ""}`,
    maxF: 700, post: 0,
    fb: [],
    wg: [
      { op: "place", x: 380, y: 540 },
      { op: "waitf", f: 20 },
      { op: "walk", dir: 1, spd: spd, jumpAt: ja, stallJump: sj, until: 96, or: 420 },
      { op: "waitf", f: 150 },
    ],
  })),
  // R1c: R1a 复跑 ×2（方差界）
  {
    name: "R1c_repeat1",
    maxF: 600, post: 0,
    fb: [],
    wg: [
      { op: "place", x: 300, y: 408 },
      { op: "waitf", f: 20 },
      { op: "walk", dir: 1, until: 96, or: 300 },
      { op: "waitf", f: 140 },
    ],
  },
  {
    name: "R1c_repeat2",
    maxF: 600, post: 0,
    fb: [],
    wg: [
      { op: "place", x: 300, y: 408 },
      { op: "waitf", f: 20 },
      { op: "walk", dir: 1, until: 96, or: 300 },
      { op: "waitf", f: 140 },
    ],
  },
  // QA: fb (749.7,536) 西行 vs 柱 tr=0（延伸）——钉位 + vx 读数 + platTr 响应
  {
    name: "QA_pillar_tr0_pin",
    maxF: 500, post: 0,
    fb: [
      { op: "place", x: 749.7, y: 536 },
      { op: "waitf", f: 30 },
      { op: "walk", dir: 1, until: 400, or: 220 },
      { op: "jump", vy: -15.5 },
      { op: "waitf", f: 80 },
    ],
    wg: [],
  },
  // QB: fb 预置按钮板 (1056,570) 压柱收起 → wg (749.7,536) 西行过通道
  {
    name: "QB_pillar_retract_pass",
    maxF: 700, post: 0,
    fb: [
      { op: "place", x: 1056, y: 570 },
      { op: "waitf", f: 400 },
    ],
    wg: [
      { op: "waitf", f: 150 },
      { op: "place", x: 749.7, y: 536 },
      { op: "waitf", f: 30 },
      { op: "walk", dir: 1, until: 500, or: 260 },
      { op: "waitf", f: 40 },
    ],
  },
  // QC: 平地对照——同 walk 在开阔地板正常位移（排除引擎睡眠/控制器冻结伪影）
  {
    name: "QC_flat_ground_control",
    maxF: 400, post: 0,
    fb: [
      { op: "place", x: 400, y: 216 },
      { op: "waitf", f: 30 },
      { op: "walk", dir: 1, until: 330, or: 160 },
      { op: "waitf", f: 30 },
    ],
    wg: [],
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
    await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 200000, polling: 100 });
    const rec = await page.evaluate("({frame: window.__rec.frame, samples: window.__rec.samples, events: window.__rec.events, qlogW: window.__q.wg.log, qlogF: window.__q.fb.log, fatal: window.__rec.fatal, win: window.__rec.win, logs: window.__rec.logs})");
    results[sc.name] = rec;
    console.log(`== ${sc.name}: frames=${rec.frame} fatal=${JSON.stringify(rec.fatal)} win=${JSON.stringify(rec.win)}`);
    for (const e of rec.events) console.log(`   f${e.f}`, JSON.stringify(e).slice(0, 250));
    if (rec.logs.length) console.log(`   engLogs:`, JSON.stringify(rec.logs.slice(0, 10)));
    const last = rec.samples[rec.samples.length - 1];
    console.log(`   last: ${JSON.stringify(last)}`);
    try { await page.screenshot({ path: `${SHOT_DIR}/wgdoor3-${sc.name}.png` }); } catch {}
  }
  await browser.close();
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

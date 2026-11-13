// probe7-ring89.mjs — crystal_03 oracle 环8/环9 落点微探针（8875 只读，v9 预演）
// 目的（01号档 §5 缺口②前置）：纸面几何不足以定环8唇落落点与环9连续链，逐场景实测:
//   S1 lip-chain : fb 置 row-4 (700,92) → 西行唇落(环8) → 落定主地板东段 → 东行跨 672 落阳台416(环9a)
//                  → 东行过 832 楔落甲板608(环9b) → 东行入甲板带 TP 上 row10 → 西行靠 box。
//                  = 环8+环9+甲板进场 一条连续链捕获。
//   S2 lever-P3  : fb 置杆东 (500,701) → 东行事件压杆 until lever.state==1 → wait12 → 西行回穿停泊 155
//                  → 原地跳+西漂 46f → 期望 P3 传送（同时验证「回穿不回翻」）。
//   S3 lip-jump690: 备份变体：fb 置 (740,92) 西行 jumpAt=690 唇落。
// 产出: tools/artifacts/probe7-ring89-out.json（逐帧采样+事件），截图 TEMP/fw-oc-pt-1/。
// 伺服: 内嵌 http 127.0.0.1:8875 ROOT=Fireboy-and-Watergirl/output/D 严格只读，收尾关闭。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8875;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/D";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-31-oracle-adjudication/tools/artifacts/probe7-ring89-out.json";
const SHOT_DIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-pt-1";

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

// 解释器 v4-mini：ops = place/walk/waitf/jump；walk 支持 until/或/settle{y0,y1,g}/untilLev/jumpAt/stallJump
const INSTALL = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  var V = function (x, y) { return new box2d.b2Vec2(x, y); };
  var pers = function (k) { return k === 'wg' ? L.pers2 : L.pers1; };
  var q = { fb: { steps: window.__stepsFB || [], idx: 0, st: null, log: [], groundN: 0 } };
  window.__q = q;
  window.__rec = { frame: 0, samples: [], events: [], done: false, qlog: [], fatal: null };
  var cap = window.__rec;
  var lastPos = {}, lastDev = {};

  function devSnap() {
    var d = {};
    L.objects.forEach(function (x) {
      var t = x.options.type;
      if (t === 'lever') d.lever = x.state;
      if (t === 'pusher') { d.pusher = x.state; try { d.pusherTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
      if (t === 'platform') { d.platTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; }
      if (t === 'box') { var bp = x.body.data.GetPosition(); d.box = { x: Math.round(-bp.x * 32 * 100) / 100, y: Math.round(-bp.y * 32 * 100) / 100 }; }
      if (t === 'door') d['door_' + x.options.properties.character] = { up: x.isUp };
    });
    return d;
  }

  function beginStep(s) {
    q.fb.st = { t0: cap.frame, lastX: null, stall: 0, jumped: false, holdN: 0 };
    q.fb.log.push({ f: cap.frame, op: s.op, dir: s.dir, until: s.until, or: s.or, settle: s.settle, untilLev: s.untilLev, jumpAt: s.jumpAt, holdF: s.holdF });
  }
  function grounded(c) { var vy = c.body.data.GetLinearVelocity().y; return Math.abs(vy) < 0.05; }

  function tick() {
    var Q = q.fb, s = Q.steps[Q.idx], st = Q.st;
    var c = pers('fb');
    if (!c) return;
    if (c.isDead) { if (!Q.deadLogged) { cap.events.push({ f: cap.frame, kind: 'death', who: 'fb' }); Q.deadLogged = true; cap.fatal = { f: cap.frame, kind: 'death' }; cap.done = true; } return; }
    var p = c.body.data.GetPosition(), x = -p.x * 32, y = -p.y * 32;
    Q.groundN = grounded(c) ? Q.groundN + 1 : 0;
    if (s.op === 'place') { c.body.data.SetPosition(V(-s.x / 32, -s.y / 32)); c.body.data.SetLinearVelocity(V(0, 0)); c.body.data.SetAwake(!0); Q.idx++; Q.st = null; return; }
    if (s.op === 'waitf') { if (cap.frame - st.t0 >= s.f) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'jump') { c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); cap.events.push({ f: cap.frame, kind: 'jump' }); Q.idx++; Q.st = null; return; }
    if (s.op === 'walk') {
      var done = false, why = null;
      if (s.jumpAt != null && !st.jumped && ((s.dir > 0 && x <= s.jumpAt) || (s.dir < 0 && x >= s.jumpAt))) {
        c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); st.jumped = true;
        cap.events.push({ f: cap.frame, kind: 'jumpAt', at: s.jumpAt, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
      }
      if (st.lastX == null) st.lastX = x;
      var moved = Math.abs(x - st.lastX) > 0.6; st.lastX = x;
      if (s.stallJump && !moved) st.stall++; else st.stall = 0;
      if (s.stallJump && st.stall >= 22) { c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); st.stall = -30; cap.events.push({ f: cap.frame, kind: 'stallJump', x: Math.round(x * 100) / 100 }); }
      c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(s.dir * (s.spd || 8.5), c.body.data.GetLinearVelocity().y));
      if (s.until != null) { if (s.dir > 0 ? x <= s.until : x >= s.until) { done = true; why = 'until'; } }
      if (!done && s.untilLev != null) { var lv = devSnap().lever; if (lv === s.untilLev) { done = true; why = 'untilLev'; } }
      if (!done && s.settle) { if (Q.groundN >= s.settle.g && y >= s.settle.y0 && y <= s.settle.y1) { done = true; why = 'settle'; } }
      if (!done && s.or != null && cap.frame - st.t0 >= s.or) { done = true; why = 'budget'; }
      if (done) {
        if (s.holdF) { st.holdN++; if (st.holdN <= s.holdF) return; }
        cap.events.push({ f: cap.frame, kind: 'stepDone', why: why, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, gN: Q.groundN });
        Q.idx++; Q.st = null;
      }
      return;
    }
    Q.idx++; Q.st = null;
  }

  plugin.update = function () {
    if (cap.done) { origUpdate.call(this); return; }
    var f = cap.frame;
    var Q = q.fb;
    if (Q.idx < Q.steps.length && !Q.st) beginStep(Q.steps[Q.idx]);
    if (Q.idx < Q.steps.length) tick();
    var dt = 1 / 60; this.game.time.elapsed = dt * 1e3;
    origUpdate.call(this);
    var c = pers('fb');
    var smp = { f: f };
    if (c) {
      var p = c.body.data.GetPosition();
      var lv = c.body.data.GetLinearVelocity(); smp.fb = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, vx: Math.round(lv.x * 100) / 100, vy: Math.round(lv.y * 100) / 100, gN: Q.groundN, awake: c.body.data.IsAwake() };
      var lp = lastPos.fb;
      if (lp) { var dx = smp.fb.x - lp.x, dy = smp.fb.y - lp.y; if (Math.abs(dx) > 30 || Math.abs(dy) > 30) cap.events.push({ f: f, kind: 'tp?', from: lp, to: smp.fb }); }
      lastPos.fb = { x: smp.fb.x, y: smp.fb.y };
    }
    var dv = devSnap();
    ['lever', 'pusher', 'pusherTr', 'platTr'].forEach(function (k) { if (dv[k] !== undefined) smp[k] = dv[k]; });
    if (dv.box) smp.box = dv.box;
    ['lever', 'pusher', 'platTr'].forEach(function (k) {
      if (lastDev[k] !== undefined && dv[k] !== undefined && dv[k] !== lastDev[k]) cap.events.push({ f: f, kind: 'dev', k: k, from: lastDev[k], to: dv[k] });
    });
    lastDev = { lever: dv.lever, pusher: dv.pusher, platTr: dv.platTr };
    smp.lever = dv.lever;
    cap.samples.push(smp);
    cap.frame++;
    if (q.fb.idx >= q.fb.steps.length) cap.done = true;
    if (f >= (window.__maxFrames || 900)) cap.done = true;
  };
})();`;

const SCEN = [
  {
    name: "S10_edgefall_reverse845",
    maxF: 1300,
    steps: [
      { op: "place", x: 700, y: 92 },
      { op: "walk", dir: 1, settle: { y0: 140, y1: 220, g: 8 }, or: 260 }, // 环8: 唇落 → 栖位 (559.6,169)
      { op: "waitf", f: 10 },
      { op: "walk", dir: -1, until: 845, or: 400 },                      // 环9a: 栖位东行走阶梯 → 阳台 → 832 缘坠落, x≥845 反转
      { op: "walk", dir: 1, settle: { y0: 515, y1: 610, g: 8 }, or: 300 }, // 环9b: 落中西行 → 576层东缘/楔/甲板西
      { op: "walk", dir: 1, until: 745, or: 300 },                       // 西行靠柱东侧
    ],
  },
  {
    name: "S11_edgefall_reverse862",
    maxF: 1300,
    steps: [
      { op: "place", x: 700, y: 92 },
      { op: "walk", dir: 1, settle: { y0: 140, y1: 220, g: 8 }, or: 260 },
      { op: "waitf", f: 10 },
      { op: "walk", dir: -1, until: 862, or: 400 },
      { op: "walk", dir: 1, settle: { y0: 515, y1: 610, g: 8 }, or: 300 },
      { op: "walk", dir: 1, until: 745, or: 300 },
    ],
  },
  {
    // 柱顶跳复测 (place 抬 8px 落稳再跳; feet 峰值 ~452 < 柱顶 480)
    name: "S12_pillar_jump_west",
    maxF: 400,
    steps: [
      { op: "place", x: 749.7, y: 532 },
      { op: "waitf", f: 40 },
      { op: "walk", dir: 1, jumpAt: 750, until: 400, or: 160 },
    ],
  },
  {
    // 塔顶跳 walk 漂移实证落点 (纸面: 落 ~326 柱东侧; 空窗死区证明不可入西舱)
    name: "S13_towerhop_walk",
    maxF: 400,
    steps: [
      { op: "place", x: 559.64, y: 162 },
      { op: "waitf", f: 40 },
      { op: "walk", dir: 1, jumpAt: 560, until: 60, or: 220 },
    ],
  },
];

async function main() {
  const srv = await startServer();
  console.log(`[serve] ${ROOT} @ http://127.0.0.1:${PORT}/gameIndex.html`);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log("[pageerror]", String(e).slice(0, 160)); });
  await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });

  const results = {};
  for (const sc of SCEN) {
    await page.evaluate(NAVIGATE);
    await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
    await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(400);
    await page.evaluate(`window.__stepsFB = ${JSON.stringify(sc.steps)}; window.__maxFrames = ${sc.maxF};`);
    await page.evaluate(INSTALL);
    await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 120000, polling: 100 });
    const rec = await page.evaluate("({frame: window.__rec.frame, samples: window.__rec.samples, events: window.__rec.events, qlog: window.__q.fb.log, fatal: window.__rec.fatal})");
    results[sc.name] = rec;
    console.log(`== ${sc.name}: frames=${rec.frame} fatal=${JSON.stringify(rec.fatal)}`);
    for (const e of rec.events) {
      if (e.kind === "tp?" || e.kind === "dev" || e.kind === "jumpAt" || e.kind === "stepDone" || e.kind === "death" || e.kind === "jump" || e.kind === "stallJump")
        console.log(`   f${e.f} ${e.kind}`, JSON.stringify(e).slice(0, 220));
    }
    const last = rec.samples[rec.samples.length - 1];
    console.log(`   last: ${JSON.stringify(last)}`);
    try { await page.screenshot({ path: `${SHOT_DIR}/probe7-${sc.name}.png` }); } catch {}
  }
  await browser.close();
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

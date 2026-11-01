// probe7-playthrough4.mjs — crystal_03 oracle 连续一脚本通关 v9（8875 只读）
// v1-v8 缺陷清单 (01号档 §5.2) 逐条修复:
//   [v8 空中压杆 10f]      → untilLev 事件压杆 (S2v2 实证 f12 翻转), 东行压、回走保位 (S2v2 杆保持1)
//   [栅栏交叉释放]          → v9 无栅栏: 全部改事件步 (untilLev/untilPusher/waitPlat/untilDoor/settle), 无同步猜时序
//   [P3 起跳弧线失败]       → 根因=杆未翻 slit 实体 (v8 f1185<被动翻杆 f1344); v9 先翻杆再跳; 停泊 155+跳+西漂46f (S2v2 f145 传送实证)
//   [环8 唇落未捕获]        → 走-off 栖位 (559.6,169) 6 次复现 (S1/S3/S4/S6/S10/S11)
//   [环9 连续穿越未捕获]     → 栖位东行阶梯→阳台→832缘坠落 x≥862 中途反转→576层柱东停泊 (S11 f162-f312 全链)
//   [v8 isDead 静默跳步]    → 死亡即记 fatal 事件并停
// 采样: 逐帧双角色+box+lever+pusher+platTr+双门; 事件: tp?/dev/stepDone(why)/jump/death/win。
// 产出: tools/artifacts/probe7-out.json; 截图 TEMP/fw-oc-pt-1/probe7-final.png。
// 伺服: 内嵌 http 127.0.0.1:8875 ROOT=Fireboy-and-Watergirl/output/D 严格只读, 收尾关闭。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8875;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/D";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-31-oracle-adjudication/tools/artifacts/probe7-out.json";
const SHOT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-pt-1/probe7-final.png";
const MAXF = 3600;

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
    wg: { steps: window.__stepsWG || [], idx: 0, st: null, log: [], groundN: 0, dead: false },
    fb: { steps: window.__stepsFB || [], idx: 0, st: null, log: [], groundN: 0, dead: false },
  };
  window.__q = q;
  window.__rec = { frame: 0, samples: [], events: [], done: false, win: null, fatal: null, qlog: [] };
  var cap = window.__rec;
  var lastPos = {}, lastDev = {}, doorState = {};

  function devs() {
    var d = { lever: null, pusher: null, pusherTr: null, platTr: null, box: null, doors: {} };
    L.objects.forEach(function (x) {
      var t = x.options.type;
      if (t === 'lever') d.lever = x.state;
      else if (t === 'pusher') { d.pusher = x.state; try { d.pusherTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
      else if (t === 'platform') { try { d.platTr = Math.round(x.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
      else if (t === 'box') { var bp = x.body.data.GetPosition(); d.box = { x: Math.round(-bp.x * 32 * 100) / 100, y: Math.round(-bp.y * 32 * 100) / 100 }; }
      else if (t === 'door') d.doors[x.options.properties.character] = !!x.isUp;
    });
    return d;
  }

  function beginStep(k, s) {
    q[k].st = { t0: cap.frame, lastX: null, stall: 0, jumped: false, holdN: 0 };
    q[k].log.push({ f: cap.frame, c: k, op: s.op, dir: s.dir, until: s.until, or: s.or, jumpAt: s.jumpAt, stallJump: !!s.stallJump, settle: s.settle, untilLev: s.untilLev, untilPusher: s.untilPusher, untilPlat: s.untilPlat, untilDoor: s.untilDoor });
  }
  function isGrounded(c) { return Math.abs(c.body.data.GetLinearVelocity().y) < 0.05; }

  function tick(k) {
    var Q = q[k], s = Q.steps[Q.idx], st = Q.st;
    var c = pers(k);
    if (!c) { Q.idx++; Q.st = null; return; }
    if (c.isDead) {
      Q.dead = true;
      cap.events.push({ f: cap.frame, kind: 'death', who: k, step: Q.idx });
      if (!cap.fatal) cap.fatal = { f: cap.frame, who: k, step: Q.idx };
      cap.done = true;
      return;
    }
    var p = c.body.data.GetPosition(), x = -p.x * 32, y = -p.y * 32;
    Q.groundN = isGrounded(c) ? Q.groundN + 1 : 0;
    if (s.op === 'waitf') { if (cap.frame - st.t0 >= s.f) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'waitPlat') {
      var dv0 = devs();
      if (dv0.platTr != null && dv0.platTr <= s.tr) { cap.events.push({ f: cap.frame, kind: 'stepDone', c: k, why: 'waitPlat', tr: dv0.platTr }); Q.idx++; Q.st = null; return; }
      if (s.or != null && cap.frame - st.t0 >= s.or) { cap.events.push({ f: cap.frame, kind: 'stepDone', c: k, why: 'budget', op: 'waitPlat' }); Q.idx++; Q.st = null; }
      return;
    }
    if (s.op === 'jump') { c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); cap.events.push({ f: cap.frame, kind: 'jump', c: k }); Q.idx++; Q.st = null; return; }
    if (s.op === 'walk') {
      var done = false, why = null;
      if (s.jumpAt != null && !st.jumped && ((s.dir > 0 && x <= s.jumpAt) || (s.dir < 0 && x >= s.jumpAt))) {
        c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); st.jumped = true;
        cap.events.push({ f: cap.frame, kind: 'jumpAt', c: k, at: s.jumpAt, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
      }
      if (st.lastX == null) st.lastX = x;
      var moved = Math.abs(x - st.lastX) > 0.6; st.lastX = x;
      if (s.stallJump && !moved) st.stall++; else st.stall = 0;
      if (s.stallJump && st.stall >= 22) { c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); st.stall = -30; cap.events.push({ f: cap.frame, kind: 'stallJump', c: k, x: Math.round(x * 100) / 100 }); }
      c.body.data.SetLinearVelocity(V(s.dir * 8.5, c.body.data.GetLinearVelocity().y));
      if (s.until != null && (s.dir > 0 ? x <= s.until : x >= s.until)) { done = true; why = 'until'; }
      if (!done) {
        var dv = devs();
        if (s.untilLev != null && dv.lever === s.untilLev) { done = true; why = 'untilLev'; }
        else if (s.untilPusher != null && dv.pusher === s.untilPusher) { done = true; why = 'untilPusher'; }
        else if (s.untilBox != null && dv.box && dv.box.x >= s.untilBox) { done = true; why = 'untilBox'; }
        else if (s.untilDoor != null && dv.doors[s.untilDoor]) { done = true; why = 'untilDoor'; }
        else if (s.settle && Q.groundN >= s.settle.g && y >= s.settle.y0 && y <= s.settle.y1) { done = true; why = 'settle'; }
        else if (s.or != null && cap.frame - st.t0 >= s.or) { done = true; why = 'budget'; }
      }
      if (done) {
        if (s.holdF) { st.holdN++; if (st.holdN <= s.holdF) return; }
        cap.events.push({ f: cap.frame, kind: 'stepDone', c: k, why: why, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, gN: Q.groundN });
        Q.idx++; Q.st = null;
      }
      return;
    }
    Q.idx++; Q.st = null;
  }

  plugin.update = function () {
    if (cap.done) { origUpdate.call(this); return; }
    var f = cap.frame;
    ['wg', 'fb'].forEach(function (k) {
      var Q = q[k];
      if (Q.idx < Q.steps.length) {
        if (!Q.st) beginStep(k, Q.steps[Q.idx]);
        tick(k);
      }
    });
    var dt = 1 / 60; this.game.time.elapsed = dt * 1e3;
    origUpdate.call(this);
    var dv = devs();
    var smp = { f: f, wi: q.wg.idx, fi: q.fb.idx };
    ['fb', 'wg'].forEach(function (k) {
      var c = pers(k);
      if (!c) return;
      var p = c.body.data.GetPosition();
      smp[k] = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100 };
      var lp = lastPos[k];
      if (lp) {
        var dx = smp[k].x - lp.x, dy = smp[k].y - lp.y;
        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) cap.events.push({ f: f, kind: 'tp?', char: k, from: lp, to: { x: smp[k].x, y: smp[k].y } });
      }
      lastPos[k] = { x: smp[k].x, y: smp[k].y };
    });
    smp.box = dv.box; smp.lever = dv.lever; smp.pusher = dv.pusher; smp.pusherTr = dv.pusherTr; smp.platTr = dv.platTr;
    if (dv.doors.fb !== undefined) smp.dfb = dv.doors.fb ? 1 : 0;
    if (dv.doors.wg !== undefined) smp.dwg = dv.doors.wg ? 1 : 0;
    ['lever', 'pusher', 'platTr'].forEach(function (kk) {
      if (lastDev[kk] !== undefined && dv[kk] !== null && dv[kk] !== lastDev[kk]) cap.events.push({ f: f, kind: 'dev', k: kk, from: lastDev[kk], to: dv[kk] });
    });
    ['fb', 'wg'].forEach(function (kk) {
      var nv = dv.doors[kk];
      if (typeof nv === 'boolean' && doorState[kk] !== undefined && doorState[kk] !== nv) cap.events.push({ f: f, kind: 'door', who: kk, up: nv });
      if (typeof nv === 'boolean') doorState[kk] = nv;
    });
    lastDev = { lever: dv.lever, pusher: dv.pusher, platTr: dv.platTr };
    cap.samples.push(smp);
    cap.frame++;
    if (!cap.win && dv.doors.fb && dv.doors.wg) { cap.win = { f: f, doors: dv.doors, fb: smp.fb, wg: smp.wg }; cap.done = true; }
    if (q.wg.idx >= q.wg.steps.length && q.fb.idx >= q.fb.steps.length && !cap.win) {
      cap.events.push({ f: f, kind: 'queueExhaustedNoWin' });
      cap.done = true;
    }
    if (f >= ${MAXF}) cap.done = true;
  };
})();`;

const W = (c, dir, until, or, extra) => Object.assign({ op: "walk", c, dir, until, or }, extra || {});
const WF = (c, f) => ({ op: "waitf", c, f });
const JP = (c) => ({ op: "jump", c });

function buildQueues() {
  const common = (c) => [
    W(c, 1, 45, 300),                                   // R1 出生笼西行 → P0 传 P1 落东廊
    W(c, 1, 810, 300),                                  // R2 东廊西行至阶梯脚
    W(c, 1, 700, 400, { stallJump: true }),             // R3 攀底部阶梯 (楔坡+32px)
    W(c, 1, 440, 400),                                  // R3b 杆西就位 (穿未翻杆区无害, v8 实证)
    W(c, -1, null, 240, { untilLev: 1, holdF: 12 }),    // R4 东行事件压杆 → lever=1 (+12f 保持)
    W(c, 1, 155, 300),                                  // R5 西行回穿停泊 155 (S2v2: 杆保持1)
    JP(c),                                              // R6 原地跳
    W(c, 1, 15, 46),                                    // R6b 西漂 46f → P3 传送 (S2v2 f145 实证)
    W(c, 1, 700, 400, { stallJump: true }),             // R7 row-6 西行 → 楔上 row-4 (v8 wg f2181-2310)
    W(c, 1, 640, 120),                                  // R7b 行至唇口 640 (v8 wg f2310-2326)
    W(c, 1, null, 260, { settle: { y0: 140, y1: 220, g: 8 } }), // R8 唇落 → 栖位 (559.6,169) [S11 f162]
    W(c, -1, 862, 400),                                 // R9a 栖位东行阶梯→阳台→832缘坠落, x≥862 反转 [S11 f251]
    W(c, 1, null, 300, { settle: { y0: 515, y1: 610, g: 8 } }), // R9b 落中西行 → 576层柱东停泊 749.7 [S11 f312]
  ];
  const fb = common("fb").concat([
    W("fb", -1, 1213, 480),                             // R10 楔下东行→甲板→甲板带 TP 上 row10 (probe5c)
    W("fb", 1, 1000, 300),                              // R11 row10 西行靠 box 东面 (~1001.6)
    W("fb", -1, 1213, 400),                             // R12 东推 box 进上带 → box TP 落甲板; fb 跟进 TP 落甲板
    W("fb", 1, null, 500, { untilPusher: 1 }),          // R13 西推 box 上板 → pusher=1 锁存 (probe5d)
    WF("fb", 150),                                      // R14 锁存保持+柱收起 (~90f)
    W("fb", 1, 330, 500, { stallJump: true }),          // R15 800楔上→穿柱下通道→西段停 330
    W("fb", 1, 40, 500),                                // R16 西壁台阶自动攀 → clamp 40
    W("fb", -1, 135, 300, { jumpAt: 100 }),             // R17 板跳 F 模式 (probe4-F: 落 (244.5,412.5))
    W("fb", -1, 290, 200),                              // R18 东行穿 P6 带 → 传 P7 落门台 (probe3-C)
    W("fb", -1, 460, 300, { untilDoor: "fb" }),         // R19 东行至 fb 门 [416,480] → isUp
  ]);
  const wg = [{ op: "waitf", c: "wg", f: 700 }].concat(common("wg")).concat([
    { op: "waitPlat", c: "wg", tr: -2.5, or: 2400 },    // R14' 事件等待柱收起 (fb 锁存链上游)
    W("wg", 1, 330, 500, { stallJump: true }),          // R15 穿柱下通道 → 西段
    W("wg", 1, 40, 500),                                // R16 西壁台阶
    W("wg", -1, 135, 300, { jumpAt: 100 }),             // R17 板跳
    W("wg", -1, 290, 200),                              // R18 P6 → P7
    W("wg", 1, 110, 300, { untilDoor: "wg" }),          // R19 西行至 wg 门 [64,128] → isUp
  ]);
  return { wg, fb };
}

async function main() {
  const srv = await startServer();
  console.log(`[serve] ${ROOT} @ http://127.0.0.1:${PORT}/gameIndex.html`);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log("[pageerror]", String(e).slice(0, 160)); });
  await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(500);
  const { wg, fb } = buildQueues();
  await page.evaluate(`window.__stepsWG = ${JSON.stringify(wg)}; window.__stepsFB = ${JSON.stringify(fb)};`);
  await page.evaluate(INSTALL);
  console.log("wg steps:", wg.length, "fb steps:", fb.length);
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 560000, polling: 100 });
  await page.screenshot({ path: SHOT });
  const rec = await page.evaluate("({frame: window.__rec.frame, samples: window.__rec.samples, events: window.__rec.events, win: window.__rec.win, fatal: window.__rec.fatal, qlog: window.__q.wg.log.concat(window.__q.fb.log)})");
  console.log(`frames=${rec.frame} WIN=${JSON.stringify(rec.win)} fatal=${JSON.stringify(rec.fatal)}`);
  for (const e of rec.events) {
    if (["tp?", "dev", "jumpAt", "jump", "stepDone", "death", "door", "queueExhaustedNoWin", "stallJump"].includes(e.kind))
      console.log(`   f${e.f} ${e.kind}`, JSON.stringify(e).slice(0, 200));
  }
  await browser.close();
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify(rec, null, 1));
  console.log("written:", OUT, "and", SHOT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

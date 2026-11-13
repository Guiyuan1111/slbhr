// probe7-playthrough4.mjs — crystal_03 oracle 连续一脚本通关 v9→v10（8875 只读）
// v1-v8 缺陷清单 (01号档 §5.2) 逐条修复 + v9 试跑新缺陷修复 (artifacts/probe7-out-v9run.json):
//   [v8 空中压杆 10f]      → untilLev 事件压杆 (S2v2 实证 f12 翻转)
//   [栅栏交叉释放]          → v9 起无栅栏: 全事件步 (untilLev/untilPusher/waitPlat/untilDoor/settle)
//   [P3 起跳弧线失败]       → 根因=杆未翻 slit 实体 (v8 f1185<被动翻杆 f1344); 先翻杆再跳, 停泊155+跳+西漂46f (S2v2 f145)
//   [环8 唇落未捕获]        → 走-off 栖位 (559.6,169) 6 次复现 (S1/S3/S4/S6/S10/S11)
//   [环9 连续穿越未捕获]     → 栖位东行阶梯→阳台→832缘坠落 x≥862 中途反转→576层柱东停泊 (S11 f162-f312)
//   [v9-new 阶梯 stallJump 抛飞] → v9 fb R3 stallJump 把角色抛上空中 (即 v8 f384 同款); v10 全队列去 stallJump, 纯走攀爬 (S2v2 f113-516 实证)
//   [v9-new 杆西向回穿回翻]   → v9 f1117 lever 1→0 (wg 压后 26f 西向回穿打回); v10 每角色自压自用+跑跳越杆西回 (jumpAt530, kernel 同款)
//   [v10-new 杆浅翻振铃]      → v10 untilLev 触发即停推=浅翻, 杆臂振铃 26-520f 内回弹 (fb f405→f446, wg f1088→f1129 双双弹回, 双角色撞死闭合 slit f587/f1269);
//                                v11 spd3 慢压+续推至 560 (触杆 ~40-50f) 把杆臂砸满止挡 → probe3-D 15f 全翻 ang-0.6632 + v8 被动全翻稳 1650f 为稳定性先例
//   [v9 wg 线 12 环全净]     → v9 wg f838-f1599 无瑕疵直达柱东停泊, 仅因 fb 未锁存卡 waitPlat; v10 保持该链不动
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
    if (s.op === 'hold') { c.body.data.SetAwake(!0); c.body.data.SetLinearVelocity(V(0, c.body.data.GetLinearVelocity().y)); if (cap.frame - st.t0 >= (s.or || 100)) { cap.events.push({ f: cap.frame, kind: 'stepDone', c: k, why: 'hold' }); Q.idx++; Q.st = null; } return; }
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
      if (s.wake) c.body.data.SetAwake(!0);
      c.body.data.SetLinearVelocity(V(s.dir * (s.spd || 8.5), c.body.data.GetLinearVelocity().y));
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
    W(c, 1, 700, 600),                                  // R3 纯走攀底部阶梯 (v9 教训: stallJump 会抛飞; S2v2 f113-516 纯走全程可攀)
    W(c, 1, 440, 400),                                  // R3b 杆西就位 (穿未翻杆区无害, v8/v9 实证)
    W(c, -1, null, 500, { spd: 3, untilLev: 1 }),       // R4a 慢速东压 (spd3 ≈1.6px/f, 触杆 ~22px/14f ≈ probe3-D 15f 全翻) → lever=1
    W(c, -1, 505, 90, { spd: 3 }),                      // R4b 续慢推 ≤90f (顶住止挡; v11 实证杆臂被推时角色 pin 在 ~490, 或预算截断)
    W(c, 1, 155, 400, { jumpAt: 530 }),                 // R5 跑跳越杆西回 (kernel 同款) → 停泊 155
    JP(c),                                              // R6 原地跳
    W(c, 1, 15, 46),                                    // R6b 西漂 46f → P3 传送 (S2v2 f145 实证)
    W(c, 1, 700, 600),                                  // R7 row-6 西行 → 楔上 row-4 (v8 wg f2181-2310 纯走)
    W(c, 1, 640, 200),                                  // R7b 行至唇口 640 (v8 wg f2310-2326)
    W(c, 1, null, 260, { settle: { y0: 140, y1: 220, g: 8 } }), // R8 唇落 → 栖位 (559.6,169) [S11 f162]
    W(c, -1, 862, 400),                                 // R9a 栖位东行阶梯→阳台→832缘坠落, x≥862 反转 [S11 f251]
    W(c, 1, null, 300, { settle: { y0: 340, y1: 610, g: 8 } }), // R9b 落定四态皆收: 踏板 361/碗沿 419.6/576 层 540.5; 后续东行碗环对四态通用 (v16/v18 实证)
  ];
  // v13: 箱链全删 —— v12 取证: box 全程未离开 row10 (f1513-1524 仅被蹭 30px 至 925.79), f1952/f2118
  // pusher 翻转均系 fb 走过按钮板自重瞬态; row10 上角色永远从 P5 出口落在箱东侧, 几何上无法绕到箱西往东推 → 抛送链不可达。
  // 改柱顶跳: 柱 [705.92,734.08]x[480,576] 顶 480, 跳峰 feet ≈452 < 480 (28px 余量), 越柱窗 ~29f > 穿越 13f。
  // v14: 柱顶跳证伪 (576层东跑道 [735,800] 仅 65px < 起跳所需 ~63px 清顶距离, 贴柱跳 f973 被吃; 甲板起跳低 32px 差 4px)。
  // 改 wg 压板开柱 (v12 实证: 压板 tr-2.5 柱收, wg f2027-2137 亲走过通道) + fb 借窗穿通道 → 西段 → fb 门 isUp。
  // wg 门(96) 在 col-8 封柱西舱永不可达 → WIN 不可能, fb 门(448) 为唯一可达门 (诚实上限: 单人单门)。
  const fb = common("fb").concat([
    W("fb", -1, 1150, 300),                             // R10 东行: 踏板/阳台东缘落 → 碗 (942) 兜底落区
    W("fb", 1, 1152, 400, { spd: 0.5 }),                // R11 微爬驻留 (until 即刻满足, 队列推进)
    W("fb", 1, 1150, 400, { spd: 0.5 }),                // R12 微爬驻留
    W("fb", 1, 330, 500),                               // R13 西行: 碗内西行上楔坡回阳台 → 阳台西缘坠落 → 576 层西段 → 330 [v16 fb f1974 实证]
    W("fb", 1, 40, 700, { wake: 1 }),                   // R14 西行 runway → 西墙钉位 ~47.6 (wake: 160-221 平台段防睡, v16 教训)
    W("fb", -1, 135, 300, { jumpAt: 100 }),             // R15 板跳 F 模式 (v12 wg f2653 实证落 (136.98,413.6) 448面)
    W("fb", -1, 290, 200),                              // R16 东行穿 P6 带 → 传 P7 落西段 (v12 wg f2695 实证)
    W("fb", -1, 460, 300, { untilDoor: "fb" }),         // R17 东行至 fb 门 [416,480] → isUp (可达终点)
    { op: "hold", c: "fb", or: 120 },                   // R18 门带驻留 120f: 让门动画走完 21 帧 → door_fb.isUp=true 入样
  ]);
  // v13: wg 终点改东段驻留 ~350 —— wg 门 [64,128] 位于 col-8 封柱(x[256,288]: 瓦片实体 y[32,160] +
  // P7 slit 贴面即传 [160,256] + 地板) 之西舱, 角色不可穿越 (v11 f3302 挡 278.66 / v12 f2783 反传实证;
  // 塔顶跳弹道空窗: 漂移 ≥14.4px/f 头撞挂柱底 160, ≤10.9px/f 落柱东侧)。wg 门不可达 → WIN 不可能, 如实驻留。
  const wg = [{ op: "waitf", c: "wg", f: 700 }].concat(common("wg")).concat([
    W("wg", 1, 330, 400),                               // R10' 576层西行 → 330
    W("wg", 1, 40, 700, { wake: 1 }),                   // R11' 西行 runway → 西墙钉位 (wake 同 fb R14)
    W("wg", -1, 135, 300, { jumpAt: 100 }),             // R12' 板跳
    W("wg", -1, 290, 200),                              // R13' P6 → P7
    W("wg", -1, 350, 250),                              // R14' 东行驻留 350 (wg 门[64,128] 在 col-8 封柱西舱不可达 — 见 04号档 §封锁; 东舱驻留为诚实终点)
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

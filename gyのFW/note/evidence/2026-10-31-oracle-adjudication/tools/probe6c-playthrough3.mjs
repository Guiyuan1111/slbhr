// probe6c-playthrough3.mjs — crystal_03 oracle 双人通关终判 v3：位置闭环脚本（8871 只读）
// 解释器: 每角色一个步骤队列, 逐步执行:
//   {op:'walk', c, dir:±1, until:x, or:帧预算, stallJump:bool, jumpAt:x}
//     - 每帧 SetLinearVelocity(dir*8.5, vy) 直到 char.x 达到 until (dir 决定比较方向) 或预算耗尽
//     - stallJump: 停滞≥22f 自动起跳 (跨台阶/越杆)
//     - jumpAt: x 达到后立即跳一次 (板跳 F 模式)
//   {op:'jump', c} / {op:'waitf', c, f:n} / {op:'barrier', c} (双队列同步栅栏)
// 产出: TEMP/fw-oc-8871/probe6c-out.json + probe6c-final.png
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe6c-out.json";
const SHOT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe6c-final.png";
const MAXF = 3000;

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
    wg: { steps: [], idx: 0, st: null, log: [] },
    fb: { steps: [], idx: 0, st: null, log: [] },
  };
  window.__q = q;
  window.__rec = { frame: 0, samples: [], events: [], done: false, win: null, qlog: [] };
  setInterval(function(){ __rec.qlog = q.wg.log.concat(q.fb.log); }, 500);
  var cap = window.__rec;
  var lastPos = {};

  function stepDone(k) { var Q = q[k]; return Q.idx >= Q.steps.length; }
  function atBarrier(k) { var Q = q[k]; if (stepDone(k)) return true; var s = Q.steps[Q.idx]; return s.op === 'barrier'; }

  function beginStep(k, s) {
    var Q = q[k];
    Q.st = { t0: cap.frame, lastX: null, stall: 0, jumped: false, wait: s.f || 0 };
    Q.log.push({ f: cap.frame, c: k, op: s.op, dir: s.dir, until: s.until, or: s.or, jumpAt: s.jumpAt, stallJump: s.stallJump });
  }

  function tickStep(k) {
    var Q = q[k], s = Q.steps[Q.idx], st = Q.st;
    var c = pers(k);
    if (!c || c.isDead) { Q.idx++; Q.st = null; return; }
    var p = c.body.data.GetPosition(), x = -p.x * 32;
    if (s.op === 'waitf') { if (cap.frame - st.t0 >= s.f) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'barrier') { if (atBarrier(k === 'wg' ? 'fb' : 'wg') || stepDone(k === 'wg' ? 'fb' : 'wg')) { Q.idx++; Q.st = null; } return; }
    if (s.op === 'jump') { c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); Q.idx++; Q.st = null; return; }
    if (s.op === 'walk') {
      var done = (s.dir > 0) ? (x <= s.until) : (x >= s.until);
      var budget = cap.frame - st.t0 >= (s.or || 600);
      // jumpAt: 单次起跳
      if (s.jumpAt != null && !st.jumped && ((s.dir > 0 && x <= s.jumpAt) || (s.dir < 0 && x >= s.jumpAt))) {
        c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5));
        st.jumped = true;
      }
      // stallJump: 停滞检测
      if (st.lastX == null) { st.lastX = x; }
      var moved = Math.abs(x - st.lastX) > 0.6;
      st.lastX = x;
      if (s.stallJump && !moved) { st.stall++; } else { st.stall = 0; }
      if (s.stallJump && st.stall >= 22) { c.body.data.SetLinearVelocity(V(c.body.data.GetLinearVelocity().x, 15.5)); st.stall = -30; }
      c.body.data.SetLinearVelocity(V(s.dir * 8.5, c.body.data.GetLinearVelocity().y));
      if (done || budget) { Q.idx++; Q.st = null; }
      return;
    }
    Q.idx++; Q.st = null;
  }

  plugin.update = function () {
    if (cap.done) { origUpdate.call(this); return; }
    var f = cap.frame;
    ['wg', 'fb'].forEach(function (k) {
      var Q = q[k];
      if (!stepDone(k) && !Q.st) beginStep(k, Q.steps[Q.idx]);
      if (Q.st) tickStep(k);
    });
    var dt = 1 / 60; this.game.time.elapsed = dt * 1e3;
    origUpdate.call(this);
    if (f % 4 === 0) {
      var s = { f: f, wi: q.wg.idx, fi: q.fb.idx };
      ['fb', 'wg'].forEach(function (k) {
        var c = pers(k);
        if (!c) return;
        var p = c.body.data.GetPosition();
        s[k] = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, dead: !!c.isDead };
        var lp = lastPos[k];
        if (lp) {
          var dx = s[k].x - lp.x, dy = s[k].y - lp.y;
          if (Math.abs(dx) > 40 || Math.abs(dy) > 40) cap.events.push({ f: f, char: k, kind: 'discont>40', from: lp, to: s[k] });
        }
        lastPos[k] = { x: s[k].x, y: s[k].y };
      });
      L.objects.forEach(function (d) {
        var t = d.options.type;
        if (t === 'platform' || t === 'pusher' || t === 'lever') {
          s[t] = { state: d.state };
          if (d.joint) { try { s[t].tr = Math.round(d.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
        }
        if (t === 'box') { var bp2 = d.body.data.GetPosition(); s.box = { x: Math.round(-bp2.x * 32 * 100) / 100, y: Math.round(-bp2.y * 32 * 100) / 100 }; }
        if (t === 'door') { s['door_' + d.options.properties.character] = { frame: d.frame, up: d.isUp }; }
      });
      if (s.door_fb && s.door_wg && s.door_fb.up && s.door_wg.up && !cap.win) {
        cap.win = { f: f, door_fb: s.door_fb, door_wg: s.door_wg };
        cap.done = true;
      }
      cap.samples.push(s);
    }
    cap.frame++;
    if (f >= ${MAXF}) cap.done = true;
  };
})();`;

const W = (c, dir, until, or, stallJump, jumpAt) => ({ op: "walk", c, dir, until, or, stallJump: !!stallJump, jumpAt: jumpAt ?? null });
const B = (c) => ({ op: "barrier", c });
const WF = (c, f) => ({ op: "waitf", c, f });
const JP = (c) => ({ op: "jump", c });

function buildQueues() {
  // 方向约定: dir=+1 屏幕×西, dir=-1 屏幕×东 (world=+x/-screen/32)
  // 关键新认识: 出生点在「笼」内——楼梯瓦片 [704,736]×[800,864] 底 864 挡头,
  //            出生化无法东行上楼梯; 唯一出口 = P0(32,848) → P1(1216,848) 东廊,
  //            再沿东廊地板西行至斜坡基座 ~802 西攀楼梯 (kernel C0→C1 同构)。
  // ================= FB 队列 (先行) =================
  const fb = [
    W("fb", 1, 45, 300),             // L1 西行入 P0 狭缝 → 传 P1 落东廊 (parks 1209, 重叠不重触发)
    W("fb", 1, 810, 300),            // L2 东廊西行 → 斜坡基座
    W("fb", 1, 700, 400, 1),         // L3 西攀 (楔坡+32px 台阶, stall 跳保险)
    W("fb", 1, 460, 500),            // L4 续攀+台面西行; 无跳, 连续压杆穿过 (翻杆需持续推 ~15f)
    W("fb", -1, 490, 300),           // L4b/L5 东行压杆西面 → 翻杆 (state1, P2/P3 开, probe3-D 实证)
    W("fb", 1, 120, 400, 1),         // L6 西行越过已翻杆 → 停西端 ~105
    B("fb"),                          // 栅栏A
    WF("fb", 42),                     // 错峰 (wg 传送后 >200ms)
    JP("fb"),                         // 跳 P3
    W("fb", 1, 15, 42, 1),           // 传送 → 落 row-6
    W("fb", 1, 700, 400, 1),         // 西行越阶
    W("fb", 1, 640, 420, 1),         // 唇口滑落口袋 (停 640 防坠竖缝)
    W("fb", -1, 830, 500, 1),        // 东下行阶梯 → row19
    W("fb", -1, 1225, 260),          // 东行 → P4 带传送 → parks row10 1209.34
    W("fb", 1, 1002, 300),           // row10 西行 → box 东面
    W("fb", -1, 1225, 300),          // 东推 box 进 P5 狭缝 → box 传 P4 落 row19; fb 跟进传 → parks row19
    W("fb", 1, 1070, 200),           // 西推 box 上按钮板 (~1043, I4)
    WF("fb", 130),                    // 等柱升 (锁存后 ~90f 全升) + 余量
    B("fb"),                          // 栅栏B
    W("fb", 1, 330, 500, 1),         // 穿柱下 → 西段 (park ~315, wg 在 ~255)
    W("fb", 1, 45, 500, 1),          // 西壁台阶 → clamp
    W("fb", -1, 135, 300, 0, 100),   // 板跳 (F)
    W("fb", -1, 285, 300),           // P6 → P7 → 门台
    W("fb", -1, 465, 300),           // 门台东行 → fb 门 sensor[416,480]
  ];
  // ================= WG 队列 (滞后 ~300f 跟随) =================
  const wg = [
    WF("wg", 700),                    // 等 fb 远离 P1 停泊区 (抵达钉滞 ~250f) 后再走
    W("wg", 1, 45, 300),             // L1 西行入 P0 → 传 P1 落东廊
    W("wg", 1, 810, 300),            // L2 东廊西行 → 斜坡基座
    W("wg", 1, 700, 400, 1),         // L3 西攀
    W("wg", 1, 460, 400, 1),         // L4 越杆 → 杆西 (fb 已翻杆则直接走过)
    W("wg", 1, 170, 400, 1),         // L6 西行 → 停 ~155 (fb 在 ~105, 间距 50)
    B("wg"),                          // 栅栏A
    JP("wg"),                         // 先跳 P3
    W("wg", 1, 15, 42, 1),           // 传送 → 落 row-6
    W("wg", 1, 700, 400, 1),         // 西行越阶
    W("wg", 1, 640, 420, 1),         // 唇口滑落口袋 (停 640 防坠 32px 竖缝)
    W("wg", -1, 830, 500, 1),        // 东下行阶梯 → row19
    W("wg", 1, 802, 200, 1),         // 西行至斜坡脚
    JP("wg"),                         // 斜坡跳
    W("wg", 1, 745, 200, 1),         // 上 row18 东段, 压柱东面待命
    B("wg"),                          // 栅栏B
    W("wg", 1, 260, 500, 1),         // 穿 720 柱下 → 西段 (park ~255)
    W("wg", 1, 45, 500, 1),          // 西壁台阶自动攀 → clamp ~40
    W("wg", -1, 135, 300, 0, 100),   // 东行走离块缘, x≥100 跳 (F 模式) → 落板
    W("wg", -1, 285, 300),           // 东行穿 P6 带 → 传 P7 → 落门台 (~285)
    W("wg", 1, 135, 300),            // 门台西行 → wg 门 sensor[64,128]
  ];
  return { wg, fb };
}

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log("[pageerror]", String(e).slice(0, 200)); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(500);
  await page.evaluate(INSTALL);
  const { wg, fb } = buildQueues();
  await page.evaluate(`window.__q.wg.steps = ${JSON.stringify(wg)}; window.__q.fb.steps = ${JSON.stringify(fb)}; window.__rec.frame = 0;`);
  console.log("wg steps:", wg.length, "fb steps:", fb.length);
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 560000, polling: 100 });
  await page.screenshot({ path: SHOT });
  const rec = await page.evaluate("window.__rec");
  console.log(`frames=${rec.frame} events=${rec.events.length} WIN=`, JSON.stringify(rec.win));
  rec.events.slice(0, 25).forEach((e) => console.log(`   ev f${e.f} ${e.char} ${e.kind} (${e.from && e.from.x},${e.from && e.from.y}) -> (${e.to && e.to.x},${e.to && e.to.y})`));
  console.log("last:", JSON.stringify(rec.samples[rec.samples.length - 1]));
  await browser.close();
  writeFileSync(OUT, JSON.stringify(rec, null, 1));
  console.log("written:", OUT, "and", SHOT);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

// probe6-playthrough.mjs — crystal_03 oracle 全流程双人通关终判（8871 只读）
// 路线：
//  1. 双角色出生层西行 → 自动攀台阶 [608,800] 上 y736 平台
//  2. fb 东行推杆 l0(496,736) 翻转 → P2/P3 开 (probe3-D/E2 实证)
//  3. 双角色错峰跳入 P3 凹龛带 x[28.8,35.2]×y[576,672] → 传 P2(1216,112) 落 row-6 (E2 实证)
//  4. row-6 西行(跳保险) → row-4 → 唇口(672)滑落口袋[576,672]顶256 → 东下行阶梯 → row19 (kernel v20 配方)
//  5. fb: 东行进 P4 带 → 传 P5 落 row10 → 西行绕到 box (960) 东侧 → 东推 box 进 P5 狭缝 →
//     传 P4 落 row19(1206) → 随后西推 box 上按钮板 → 锁存 tr 0.5954 → 柱升 tr=-3 (I4 实证)
//  6. 双角色西行 row19 → col24 斜坡跳上台 → row18 东段西行穿柱下 (G 实证) → 西段
//  7. 西壁台阶自动攀 576→544→512 → 东缘跳上 row-14 板 (F 实证) → 东行穿 P6 带 → 传 P7 落门台 (C 实证)
//  8. fb 入 fb 门(448,256)、wg 入 wg 门(96,256) → 双门 frame21/isUp → checkEndGame → 通关
// 产出: TEMP/fw-oc-8871/probe6-out.json + probe6-final.png
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe6-out.json";
const SHOT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe6-final.png";

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
  window.__rec = { frame: 0, samples: [], events: [], done: false, win: null };
  window.__ctrl = { plan: [], maxFrames: 1500 };
  var cap = window.__rec;
  var V = function (x, y) { return new box2d.b2Vec2(x, y); };
  var pers = function (k) { return k === 'wg' ? L.pers2 : L.pers1; };
  var lastPos = {};
  plugin.update = function () {
    if (cap.done) { origUpdate.call(this); return; }
    var f = cap.frame;
    window.__ctrl.plan.forEach(function (step) {
      if (step.walk != null) {
        if (f < step.t0 || f >= (step.t1 == null ? 1e9 : step.t1)) return;
        var c = pers(step.char);
        if (c && !c.isDead) c.body.data.SetLinearVelocity(V(step.walk * 8.5, c.body.data.GetLinearVelocity().y));
        return;
      }
      if (f !== step.t0 || step.used) return;
      step.used = true;
      var c2 = pers(step.char);
      if (step.jump && c2 && !c2.isDead) c2.body.data.SetLinearVelocity(V(c2.body.data.GetLinearVelocity().x, 15.5));
      if (step.tp && c2) { c2.body.data.SetPosition(V(-step.tp[0] / 32, -step.tp[1] / 32)); c2.body.data.SetLinearVelocity(V(0, 0)); }
    });
    var dt = 1 / 60; this.game.time.elapsed = dt * 1e3;
    origUpdate.call(this);
    if (f % 4 === 0) {
      var s = { f: f };
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
      }
      cap.samples.push(s);
    }
    cap.frame++;
    if (f >= window.__ctrl.maxFrames) cap.done = true;
  };
})();`;

const W = (t0, t1, char, walk) => ({ t0, t1, char, walk });
const J = (t0, char) => ({ t0, char, jump: 1 });

function buildPlan() {
  const p = [];
  // ---- 1. 登 y736 平台（西行自动攀）----
  p.push(W(20, 105, "fb", 1));    // fb 632 → ~250
  p.push(W(60, 145, "wg", 1));    // wg 560 → ~322 (落后 72px)
  // ---- 2. fb 推杆 ----
  p.push(W(110, 168, "fb", -1));  // fb 东行 → 杆西面 ~478 → 翻转 (E2: walk -1 进杆即翻)
  // ---- 3. 错峰跳 P3 凹龛 ----
  p.push(W(170, 262, "fb", 1));   // fb 西行回西端 (clamp ~79.4)
  p.push(W(215, 300, "wg", 1));   // wg 西行至西端 (fb 之后)
  p.push(J(265, "fb"));           // fb 起跳 → 中心带 → P3 → P2 (E2: 跳后 ~9f 触发)
  p.push(W(265, 295, "fb", 1));
  p.push(J(302, "wg"));           // wg 错峰 37f (>200ms 冷却)
  p.push(W(302, 332, "wg", 1));
  // ---- 4. 下降链 row-6 → row-4 → 口袋 → 东下行阶梯 → row19 ----
  // fb 落 row-6 ~f295 (E2: 落点 ~1000-1200, feet 192)
  p.push(W(310, 390, "fb", 1));   // 西行 (步 960/928 自动攀)
  p.push(J(345, "fb"));           // 保险跳 (跨 928-992 台阶)
  p.push(W(392, 412, "fb", 1));   // 唇口 672 西滑落口袋 256
  p.push(W(422, 512, "fb", -1));  // 东下行阶梯: 口袋→col21 柱顶 320→r13 阳台 416→r14→row19 608
  // wg 同链 +35f
  p.push(W(345, 425, "wg", 1));
  p.push(J(380, "wg"));
  p.push(W(427, 447, "wg", 1));
  p.push(W(457, 547, "wg", -1));
  // ---- 5. fb box 腿 (I4 配方) ----
  // fb 落 row19 ~f500 (~900-1000)；先东行进 P4 带 → 传 P5 落 row10
  p.push(W(520, 640, "fb", -1));  // fb 东行 → P4 带 [1197,1235] → 传 P5 (1209,284)
  p.push(W(650, 700, "fb", 1));   // row10 西行绕到 box 东面 (box 960, 面 1002)
  p.push(W(705, 812, "fb", -1));  // 东推 box → 进 P5 狭缝传走 (~f800)；fb 跟进传送 (~f815) 落 row19 1209
  p.push(W(820, 858, "fb", 1));   // 落地即西推 box (1206 → ~1050) 一次到位
  // box 锁存 → pusher tr~0.6 → 柱升 tr -3 (~1.5s)
  // ---- 6/7. 双角色过 row18 → 西段 → 板跳 → P6 ----
  // wg 先动（fb 推完箱需静止站循）；此时柱应已升起 (wg 到柱位 ~f960 > f880 柱全升)
  p.push(W(900, 930, "wg", 1));   // wg row19 西行 (950 → ~814)
  p.push(J(930, "wg"));           // 斜坡跳上台 row18 东段 (~750)
  p.push(W(930, 960, "wg", 1));
  p.push(W(960, 1030, "wg", 1));  // 西行穿柱下 (720) → 西段
  p.push(W(1030, 1108, "wg", 1)); // 西壁台阶自动攀 576→544→512 (clamp ~40)
  p.push(W(1112, 1130, "wg", -1));// 东行走离块缘
  p.push(J(1124, "wg"));          // 空中跳 (F 实证模式)
  p.push(W(1124, 1148, "wg", -1));// 落 row-14 板 (~244)
  p.push(W(1158, 1185, "wg", -1));// 东行穿 P6 带 → 传 P7 → 落门台
  // fb 随后同路线 (+~60f)
  p.push(W(960, 990, "fb", 1));   // fb (1065) 西行
  p.push(J(990, "fb"));
  p.push(W(990, 1020, "fb", 1));
  p.push(W(1020, 1090, "fb", 1)); // 穿柱下 → 西段
  p.push(W(1090, 1168, "fb", 1)); // 台阶 → clamp 512 顶
  p.push(W(1172, 1190, "fb", -1));
  p.push(J(1184, "fb"));
  p.push(W(1184, 1208, "fb", -1));
  p.push(W(1218, 1245, "fb", -1));// P6 → P7 → 门台
  // ---- 8. 入门 ----
  p.push(W(1250, 1285, "wg", 1)); // wg 门台西行 → wg 门 (96,256) sensor[64,128]
  p.push(W(1250, 1288, "fb", -1));// fb 门台东行 → fb 门 (448,256) sensor[416,480]
  return p;
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
  const plan = buildPlan();
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = 1500; window.__rec.frame = 0;`);
  console.log("plan steps:", plan.length);
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 480000, polling: 100 });
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

// probe6b-playthrough2.mjs — crystal_03 oracle 全流程双人通关终判 v2（8871 只读）
// v1 教训：y736 平台是 32px 薄板（下方可通行）；楼梯 [608,800] 须从东侧 x≥810 西行自动攀；
//         未翻杆主动推可过/跳过；传送落点 1209.34 处「重叠不重触发」(latch)，走离后再触发。
// 路线: 东行绕梯 → 西攀台阶上 y736 平台 → 跳过杆 → fb 东推翻杆(P2/P3 开) → 双角色错峰跳 P3 凹龛
//       → 传 P2 落 row-6 → 西行越阶到 row-4 → 唇口滑落口袋 → 东下行阶梯落 row19
//       → fb: P4 带 → P5 落 row10 → 绕到 box 东侧东推 box 进 P5 狭缝 → 传 P4 落 row19
//         → 西推 box 上按钮板锁存 (I4 实证) → 柱升 tr=-3
//       → wg 先行: row19 西行跳 col24 斜坡上 row18 东段(柱下待命) → 柱升后穿 720 → 西段
//         → 西壁台阶 → 东缘跳上板 (F) → 穿 P6 传 P7 落门台 → 入 wg 门
//       → fb 随后同路线 → 入 fb 门 → 双门 isUp → checkEndGame 通关
// 产出: TEMP/fw-oc-8871/probe6b-out.json + probe6b-final.png
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe6b-out.json";
const SHOT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe6b-final.png";

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
  window.__ctrl = { plan: [], maxFrames: 1560 };
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
const JJ = (t0, char) => ({ t0, char, jump: 1 });

function buildPlan() {
  const p = [];
  // ===== 阶段 A: 东行绕到楼梯东侧 =====
  p.push(W(20, 58, "wg", -1));    // wg 560 → ~812
  p.push(W(40, 80, "fb", -1));    // fb 632 → ~813
  // ===== 阶段 B: 西行自动攀台阶上 y736 平台 =====
  p.push(W(64, 134, "wg", 1));    // wg 812 → 攀升 → 杆东面 ~531 压住
  p.push(JJ(136, "wg"));          // wg 跳过杆
  p.push(W(136, 160, "wg", 1));   // 空中西漂 → 落杆西 ~430
  p.push(W(86, 156, "fb", 1));    // fb 813 → 攀升 → 杆东面 ~531 压住
  p.push(JJ(158, "fb"));          // fb 跳过杆
  p.push(W(158, 182, "fb", 1));   // 落杆西 ~413
  // ===== 阶段 C: fb 东推翻杆 (probe3-D 模式: 主动推 ~15f 翻转) =====
  p.push(W(187, 222, "fb", -1));  // fb 东行压杆西面 → 翻转 (state1, P2/P3 开) → 继续走到 ~560
  // ===== 阶段 D: 错峰赴台西端跳 P3 凹龛 (wg 先跳, fb 后跳) =====
  p.push(W(165, 250, "wg", 1));   // wg 西行至西端 clamp ~79.4 (f250 到位)
  p.push(W(222, 290, "fb", 1));   // fb 西行中途停 ~254 (避开 wg 跳点)
  p.push(JJ(322, "wg"));          // wg 端点起跳 (E2 模式) → 传 P3→P2 f~331
  p.push(W(322, 352, "wg", 1));   // 空中西推
  p.push(W(330, 362, "fb", 1));   // fb 西行至端点 ~109
  p.push(JJ(365, "fb"));          // fb 起跳 (wg 传送后 34f > 200ms 冷却)
  p.push(W(365, 395, "fb", 1));
  // ===== 阶段 E: 下降链 row-6 → row-4 → 口袋 → 东下行阶梯 → row19 =====
  // wg 落 row-6 ~f350 (~1000-1100), 先行
  p.push(W(368, 448, "wg", 1));   // 西行 (928/960 台阶)
  p.push(JJ(398, "wg"));          // 越阶保险跳
  p.push(W(453, 473, "wg", 1));   // 唇口 672 西滑落口袋 256
  p.push(W(481, 571, "wg", -1));  // 东下行阶梯 → row19 (~950)
  // fb 落 row-6 ~f380, +30f 跟随
  p.push(W(398, 478, "fb", 1));
  p.push(JJ(428, "fb"));
  p.push(W(483, 503, "fb", 1));
  p.push(W(511, 601, "fb", -1));  // → row19 (~900)
  // ===== 阶段 F: fb box 腿 =====
  p.push(W(611, 700, "fb", -1));  // fb row19 东行 → P4 带 → 传 P5 落 row10 (parks 1209.34, latch 不重触发)
  p.push(W(710, 756, "fb", 1));   // row10 西行 → box (960) 东面 ~1001
  p.push(W(762, 870, "fb", -1));  // 东推 box → 进 P5 狭缝传走 (~f817); fb 跟进传 P4 落 row19 1209 (parks)
  p.push(W(880, 918, "fb", 1));   // 西推 box 1206 → ~1050 上按钮板 (I4: 37f → 1043)
  // box 锁存: pusher tr~0.6 → 柱升 tr=-3 (~f1010 全升)
  // ===== 阶段 G: wg 先行到柱下待命并过柱 =====
  p.push(W(573, 605, "wg", 1));   // wg row19 西行 → 斜坡脚 ~805
  p.push(JJ(607, "wg"));          // 斜坡跳
  p.push(W(607, 643, "wg", 1));   // 上 row18 东段 → 压柱东面 ~750 待命 (柱未升)
  p.push(W(1020, 1100, "wg", 1)); // 柱全升 (f~1010) 后 → 穿 720 → 西段 (~383)
  p.push(W(1104, 1182, "wg", 1)); // 西壁台阶自动攀 576→544→512 → clamp ~40
  p.push(W(1186, 1206, "wg", -1));// 东行走离块缘 (F 模式)
  p.push(JJ(1202, "wg"));         // 空中跳
  p.push(W(1202, 1226, "wg", -1));// 落 row-14 板 ~244
  p.push(W(1232, 1260, "wg", -1));// 东行穿 P6 带 → 传 P7 → 落门台 (~340)
  p.push(W(1266, 1311, "wg", 1)); // 门台西行 → wg 门 sensor[64,128] (~136)
  // ===== 阶段 H: fb 随后过柱 =====
  p.push(W(1025, 1105, "fb", 1)); // fb (1073) 西行 → 斜坡 → 穿柱下 → 西段 (~711)
  p.push(W(1109, 1245, "fb", 1)); // 西壁台阶 → clamp ~40
  p.push(W(1249, 1269, "fb", -1));// 走离块缘
  p.push(JJ(1265, "fb"));
  p.push(W(1265, 1289, "fb", -1));// 落板 ~244
  p.push(W(1295, 1323, "fb", -1));// 穿 P6 → 传 P7 → 门台 (~340)
  p.push(W(1329, 1358, "fb", -1));// 门台东行 → fb 门 sensor[416,480] (~471)
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
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = 1560; window.__rec.frame = 0;`);
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

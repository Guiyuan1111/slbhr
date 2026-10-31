// probe2-behavior.mjs — crystal_03 oracle 行为探针（8871 只读）
// plan 动作（帧驱动，每物理帧先于 origUpdate）:
//   {t0,t1,char,walk:+-1} 按帧直写 vx=±8.5m/s（保留 vy）
//   {t0,char,jump:1}      该帧置 vy=+15.5m/s（world up，oracle jumpVelocity）
//   {t0,char,tp:[x,y]}    屏幕坐标瞬移并清零速度
//   {t0,boxTP:[x,y]}      箱子瞬移
//   {t0,char,stop:1}      清除该 char 剩余 plan（防后续步骤覆盖）
// 场景:
//  T1a pusher 按压/释放: fb 空降至 pusher(1056,608)，f258 瞬离；全程记 pusher/platform joint
//  T1b fb 站柱顶: fb 先落柱顶(720,480)，wg 后压 pusher，看柱是否下沉
//  T2  row-14 板横穿: fb 放板顶 (250,412.8) 东行穿 x=272 → P6 触发→P7 门台
//  T3  block-jump: fb 站 [0,96]顶512 东缘助跑起跳漂移 → 落点（能否上 row-14 板）
//  T4  运行时 tilemap Tutorial 层 dump（i18n 文本源）
// 产出: TEMP/fw-oc-8871/probe2-out.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe2-out.json";

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
  window.__rec = { frame: 0, samples: [], events: [], done: false };
  window.__ctrl = { plan: [], maxFrames: 600 };
  var cap = window.__rec;
  var V = function (x, y) { return new box2d.b2Vec2(x, y); };
  var pers = function (k) { return k === 'wg' ? L.pers2 : L.pers1; };
  var lastPos = {};
  plugin.update = function () {
    if (cap.done) { origUpdate.call(this); return; }
    var f = cap.frame;
    window.__ctrl.plan.forEach(function (step) {
      if (step.used) return;
      if (f < step.t0) return;
      if (step.walk != null) {
        if (f >= (step.t1 == null ? 1e9 : step.t1)) { return; }
        var c = pers(step.char);
        if (c && !c.isDead) c.body.data.SetLinearVelocity(V(step.walk * 8.5, c.body.data.GetLinearVelocity().y));
        return;
      }
      if (f !== step.t0) return;
      step.used = true;
      var c2 = pers(step.char);
      if (step.jump && c2 && !c2.isDead) c2.body.data.SetLinearVelocity(V(c2.body.data.GetLinearVelocity().x, 15.5));
      if (step.tp && c2) { c2.body.data.SetPosition(V(-step.tp[0] / 32, -step.tp[1] / 32)); c2.body.data.SetLinearVelocity(V(0, 0)); }
      if (step.stop != null) { step.used = true; }
    });
    // stop 语义：帧号达到后删除该 char 所有后续 walk
    var f2 = cap.frame;
    window.__ctrl.plan.forEach(function (step) {
      if (step.stop && f2 >= step.t0 && !step.stopDone) { step.stopDone = true; var from = step.t0; window.__ctrl.plan.forEach(function (s2) { if (s2.walk != null && s2.t0 >= from && s2.char === step.char) s2.t1 = Math.min(s2.t1 == null ? 1e9 : s2.t1, from); }); }
    });
    var dt = 1 / 60; this.game.time.elapsed = dt * 1e3;
    origUpdate.call(this);
    if (f % 2 === 0) {
      var s = { f: f };
      ['fb', 'wg'].forEach(function (k) {
        var c = pers(k);
        if (!c) return;
        var p = c.body.data.GetPosition();
        s[k] = { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, dead: !!c.isDead };
        var lp = lastPos[k];
        if (lp) {
          var dx = s[k].x - lp.x, dy = s[k].y - lp.y;
          if (Math.abs(dx) > 40 || Math.abs(dy) > 40) cap.events.push({ f: f, char: k, kind: 'jump>40px', from: lp, to: s[k] });
        }
        lastPos[k] = { x: s[k].x, y: s[k].y };
      });
      L.objects.forEach(function (d, i) {
        var t = d.options.type;
        if (t === 'platform' || t === 'pusher' || t === 'lever') {
          s[t] = { state: d.state };
          if (d.joint) {
            try { s[t].tr = Math.round(d.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {}
            try { s[t].ang = Math.round(d.joint.GetJointAngleRadians() * 1e4) / 1e4; } catch (e) {}
          }
          var pd = (d.body && d.body.data) ? d.body.data : (d.button && d.button.body ? d.button.body.data : null);
          if (pd) { var p = pd.GetPosition(); s[t].cy = Math.round(-p.y * 32 * 100) / 100; }
        }
      });
      cap.samples.push(s);
    }
    cap.frame++;
    if (f >= window.__ctrl.maxFrames) cap.done = true;
  };
  window.__boxTP = function (x, y) {
    var L2 = g.level;
    L2.objects.forEach(function (d) { if (d.options.type === 'box') { d.body.data.SetPosition(V(-x / 32, -y / 32)); d.body.data.SetLinearVelocity(V(0, 0)); } });
  };
  window.__tutDump = function () {
    var map = g.cache.getTilemapData('map').data;
    var out = [];
    map.layers.forEach(function (l) {
      if (l.type === 'objectgroup' || l.objects) {
        var t = { name: l.name, objs: [] };
        (l.objects || []).forEach(function (o) { if (o.text) t.objs.push({ text: o.text.text, x: o.x, y: o.y, w: o.width, id: o.properties && o.properties.id }); });
        if (t.objs.length) out.push(t);
      }
    });
    return out;
  };
})();`;

async function runScenario(browser, name, plan, maxFrames, extraEval) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => console.log(`[${name}][pageerror]`, String(e).slice(0, 300)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(600);
  await page.evaluate(INSTALL);
  const tut = await page.evaluate("window.__tutDump()");
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = ${maxFrames}; window.__rec.frame = 0;`);
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 240000, polling: 100 });
  const rec = await page.evaluate("window.__rec");
  let extra = null;
  if (extraEval) extra = await page.evaluate(extraEval);
  const evs = rec.events;
  console.log(`[${name}] frames=${rec.frame} events=${evs.length}`);
  evs.slice(0, 12).forEach((e) => console.log(`   ev f${e.f} ${e.char} ${e.kind} (${e.from && e.from.x},${e.from && e.from.y}) -> (${e.to && e.to.x},${e.to && e.to.y})`));
  console.log(`[${name}] last:`, JSON.stringify(rec.samples[rec.samples.length - 1]));
  await page.close();
  return { name, tut, rec, extra };
}

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const results = {};

  // T1a: fb 空降到 pusher 上，站立 ~4s，然后瞬移到 (900,560)（row19 上空）释放
  results.T1a = await runScenario(
    browser, "T1a",
    [
      { t0: 2, char: "fb", tp: [1056, 540] },          // 落到按钮上方
      { t0: 260, char: "fb", tp: [900, 560] },         // 离开
    ],
    420
  );

  // T1b: fb 先站柱顶 (720,440)，wg 压 pusher；看柱是否下沉
  results.T1b = await runScenario(
    browser, "T1b",
    [
      { t0: 2, char: "fb", tp: [720, 440] },
      { t0: 80, char: "wg", tp: [1056, 540] },
      { t0: 300, char: "wg", tp: [900, 560] },
    ],
    460
  );

  // T2: fb 放 row-14 板顶西侧 (250,412.8)，东行穿 x=272 → P6→P7；再走动观察门台落位
  results.T2 = await runScenario(
    browser, "T2",
    [
      { t0: 2, char: "fb", tp: [250, 412.8] },
      { t0: 40, t1: 120, char: "fb", walk: 1 },
      { t0: 260, t1: 340, char: "fb", walk: -1 },
    ],
    480
  );

  // T3: fb 站 [0,96] 顶 512 (40,476.8)，东行助跑 f30 起跳（x≈88 东缘前），空中保持右推
  results.T3 = await runScenario(
    browser, "T3",
    [
      { t0: 2, char: "fb", tp: [40, 476.8] },
      { t0: 30, t1: 41, char: "fb", walk: 1 },
      { t0: 41, char: "fb", jump: 1 },
      { t0: 41, t1: 50, char: "fb", walk: 1 },
    ],
    260
  );

  // T3b: 起跳更晚（东缘 f38）
  results.T3b = await runScenario(
    browser, "T3b",
    [
      { t0: 2, char: "fb", tp: [30, 476.8] },
      { t0: 30, t1: 39, char: "fb", walk: 1 },
      { t0: 38, char: "fb", jump: 1 },
      { t0: 38, t1: 47, char: "fb", walk: 1 },
    ],
    260
  );

  // T5: fb 站 row19 (1000,572.8) 东行 → 右墙 AA 视觉墙内触发 P4(1216,560) → 应被传到 P5(1216,272) 落 row10
  results.T5 = await runScenario(
    browser, "T5",
    [
      { t0: 2, char: "fb", tp: [1000, 572.8] },
      { t0: 30, t1: 110, char: "fb", walk: 1 },
      { t0: 200, t1: 280, char: "fb", walk: -1 },
    ],
    420
  );





  await browser.close();
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

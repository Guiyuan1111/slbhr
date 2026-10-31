// probe5d-boxlatch.mjs — I 终版：box 落 row19 (1206) 后立即西推至按钮板 (~1060) → 锁存验证
// 产出: TEMP/fw-oc-8871/probe5d-out.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe5d-out.json";

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
          if (Math.abs(dx) > 40 || Math.abs(dy) > 40) cap.events.push({ f: f, char: k, kind: 'discont>40', from: lp, to: s[k] });
        }
        lastPos[k] = { x: s[k].x, y: s[k].y };
      });
      L.objects.forEach(function (d) {
        var t = d.options.type;
        if (t === 'platform' || t === 'pusher' || t === 'lever') {
          s[t] = { state: d.state };
          if (d.joint) { try { s[t].tr = Math.round(d.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {} }
          var pd = (d.body && d.body.data) ? d.body.data : (d.button && d.button.body ? d.button.body.data : null);
          if (pd) { var p = pd.GetPosition(); s[t].cy = Math.round(-p.y * 32 * 100) / 100; }
        }
        if (t === 'box') { var bp2 = d.body.data.GetPosition(); s.box = { x: Math.round(-bp2.x * 32 * 100) / 100, y: Math.round(-bp2.y * 32 * 100) / 100 }; }
        if (t === 'door') { s['door_' + d.options.properties.character] = { frame: d.frame, up: d.isUp }; }
      });
      cap.samples.push(s);
    }
    cap.frame++;
    if (f >= window.__ctrl.maxFrames) cap.done = true;
  };
  window.__dumpMech = function () {
    var L2 = g.level;
    var out = {};
    var V2S = function (p) { return { x: Math.round(-p.x * 32 * 1000) / 1000, y: Math.round(-p.y * 32 * 1000) / 1000 }; };
    L2.objects.forEach(function (d) {
      if (d.options.type === 'platform') {
        var bd = d.body.data;
        out.platform = { pos: V2S(bd.GetPosition()), tr: d.joint.GetJointTranslation() };
      }
      if (d.options.type === 'box') out.box = { pos: V2S(d.body.data.GetPosition()), mass: d.body.data.GetMass() };
      if (d.options.type === 'pusher') out.pusherTr = d.joint.GetJointTranslation();
    });
    return out;
  };
})();`;

async function runScenario(browser, name, plan, maxFrames, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log(`[${name}][pageerror]`, String(e).slice(0, 200)); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(500);
  await page.evaluate(INSTALL);
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = ${maxFrames}; window.__rec.frame = 0;`);
  if (opts.dumpAt) await page.waitForFunction(`(() => { try { return window.__rec.frame >= ${opts.dumpAt}; } catch { return false; } })()`, null, { timeout: 240000, polling: 50 });
  const mech = opts.dumpAt ? await page.evaluate("window.__dumpMech()") : null;
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 360000, polling: 100 });
  const rec = await page.evaluate("window.__rec");
  console.log(`[${name}] frames=${rec.frame} events=${rec.events.length}`);
  rec.events.slice(0, 12).forEach((e) => console.log(`   ev f${e.f} ${e.char} ${e.kind} (${e.from && e.from.x},${e.from && e.from.y}) -> (${e.to && e.to.x},${e.to && e.to.y})`));
  console.log(`[${name}] last:`, JSON.stringify(rec.samples[rec.samples.length - 1]));
  if (mech) console.log(`[${name}] mech@${opts.dumpAt}:`, JSON.stringify(mech));
  await page.close();
  return { name, rec, mech };
}

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });

  const plan = [
    { t0: 2, char: "fb", tp: [900, 284.8] },    // row10, box 西侧
    { t0: 30, t1: 130, char: "fb", walk: -1 },  // 东推 box → box 进 P5 传走 (~f101)；fb 跟进传送 (~f114) 落 row19 (1209)
    { t0: 135, t1: 172, char: "fb", walk: 1 },  // 落地即西推 box (1206 → ~1050)，一次到位
    // 之后静止：box 锁存按钮 → pusher tr>0.2 → platform tr→-3
  ];
  const maxFrames = 620;

  const result = await runScenario(browser, "I4_boxLatch", plan, maxFrames, { dumpAt: 580 });

  // 输出关键窗口样本
  const S = result.rec.samples;
  console.log("--- box/pusher/platform f95..240 ---");
  for (const s of S) if (s.f >= 95 && s.f <= 240 && s.f % 8 === 0) console.log(s.f, "fb", s.fb.x.toFixed(1), s.fb.y.toFixed(1), "| box", s.box ? s.box.x.toFixed(1) : "-", s.box ? s.box.y.toFixed(1) : "-", "| pusher tr", s.pusher.tr, "st" + s.pusher.state, "| plat tr", s.platform.tr, "cy", s.platform.cy);
  console.log("--- tail f560..618 ---");
  for (const s of S) if (s.f >= 560) console.log(s.f, "fb", s.fb.x.toFixed(1), "| box", s.box.x.toFixed(1), s.box.y.toFixed(1), "| pusher tr", s.pusher.tr, "st" + s.pusher.state, "| plat tr", s.platform.tr, "cy", s.platform.cy);

  await browser.close();
  writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

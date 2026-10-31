// probe3-adjudicate.mjs — crystal_03 oracle 裁决探针（8871 只读）
// 修正控制方向：world +x = 屏幕 WEST，walk:-1 = 屏幕东，walk:+1 = 屏幕西；jump: vy=+15.5(world)=上
// 场景:
//  A: fb 走上 pusher → 柱升起(tr-3) → dump 柱/板 world 顶点+接触对 → fb 走回 row18 东段→西行穿 x=720 过道
//  B: (对照) 柱未升：fb 从 row18 西段东行 → 应被柱挡在 x≈706
//  C: fb 板顶(250,412.8) 东行穿 x=272 → P6→P7 传送 → 门台落点
//  D: fb 杆西(450,700.8) 东行推杆 → P2/P3 state 变化
//  E: 杆开后 fb 从 y736 台西端跳入 P3 凹龛 → 传至 P2(1216,112) 落 row-6
//  F: fb 站 [0,96]顶512 东行助跑+东缘起跳 → 落点（能否上 row-14 板）
// 产出: TEMP/fw-oc-8871/probe3-out.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe3-out.json";

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
          if (d.joint) {
            try { s[t].tr = Math.round(d.joint.GetJointTranslation() * 1e4) / 1e4; } catch (e) {}
            try { s[t].ang = Math.round(d.joint.GetJointAngleRadians() * 1e4) / 1e4; } catch (e) {}
          }
          var pd = (d.body && d.body.data) ? d.body.data : (d.button && d.button.body ? d.button.body.data : null);
          if (pd) { var p = pd.GetPosition(); s[t].cy = Math.round(-p.y * 32 * 100) / 100; }
        }
        if (t === 'portal' && d.options.properties.portalId === 2) s['p2pair'] = (s['p2pair'] || 0) + d.state;
        if (t === 'portal' && d.options.properties.portalId === 1) s['p1pair'] = (s['p1pair'] || 0) + d.state;
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
        out.platform = {
          type: bd.GetType(), mass: bd.GetMass(), pos: V2S(bd.GetPosition()),
          tr: d.joint.GetJointTranslation(),
          fixtures: (function () { var a = [], fx = bd.GetFixtureList(); while (fx) { var sh = fx.GetShape(), vs = []; for (var i = 0; i < sh.m_count; i++) { var w = box2d.b2MulXV(bd.GetTransform(), sh.m_vertices[i], new box2d.b2Vec2()); vs.push(V2S(w)); } a.push(vs); fx = fx.GetNext(); } return a; })(),
        };
      }
    });
    // 板 [704,800]x[416,448] ground fixture world verts + 与柱重叠判断
    var gb = L2.groundBody, contacts = [];
    (function () {
      var fx = gb.GetFixtureList();
      while (fx) {
        var sh = fx.GetShape(), vs = [];
        for (var i = 0; i < sh.m_count; i++) { var w = box2d.b2MulXV(gb.GetTransform(), sh.m_vertices[i], new box2d.b2Vec2()); vs.push(V2S(w)); }
        var xs = vs.map(function (v) { return v.x; }), ys = vs.map(function (v) { return v.y; });
        var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
        if (x0 > 690 && x1 < 820 && y0 > 400 && y1 < 460) out.board = { aabb: [x0, x1, y0, y1], verts: vs };
        fx = fx.GetNext();
      }
    })();
    // 接触对
    var c = g.physics.box2d.world.GetContactList();
    while (c) {
      try {
        var ua = c.m_fixtureA.m_body.m_userData, ub = c.m_fixtureB.m_body.m_userData;
        if (ua === 'ground' || ub === 'ground') {
          var oa = c.m_fixtureA.m_body.GetPosition(), ob = c.m_fixtureB.m_body.GetPosition();
          if (Math.abs(-ob.x * 32 - 720) < 60 && Math.abs(-ob.y * 32 - 432) < 80) contacts.push({ other: ua, touching: c.IsTouching(), platPos: V2S(ob) });
        }
      } catch (e) {}
      c = c.m_next;
    }
    out.contactsNearPlatform = contacts;
    return out;
  };
})();`;

async function runScenario(browser, name, plan, maxFrames, dumpAt) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => console.log(`[${name}][pageerror]`, String(e).slice(0, 200)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(500);
  await page.evaluate(INSTALL);
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = ${maxFrames}; window.__rec.frame = 0;`);
  if (dumpAt) await page.waitForFunction(`(() => { try { return window.__rec.frame >= ${dumpAt}; } catch { return false; } })()`, null, { timeout: 120000, polling: 50 });
  const mech = dumpAt ? await page.evaluate("window.__dumpMech()") : null;
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 240000, polling: 100 });
  const rec = await page.evaluate("window.__rec");
  console.log(`[${name}] frames=${rec.frame} events=${rec.events.length}`);
  rec.events.slice(0, 10).forEach((e) => console.log(`   ev f${e.f} ${e.char} ${e.kind} (${e.from && e.from.x},${e.from && e.from.y}) -> (${e.to && e.to.x},${e.to && e.to.y})`));
  console.log(`[${name}] last:`, JSON.stringify(rec.samples[rec.samples.length - 1]));
  if (mech) console.log(`[${name}] mech@${dumpAt}:`, JSON.stringify(mech));
  await page.close();
  return { name, rec, mech };
}

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const results = {};

  // A: fb 站 row19 (1000,572.8) → 东行(walk:-1)上按钮(f30-110) → 柱升 → f320 dump → fb 西行回 row18 东段并继续西行穿 x=720
  results.A = await runScenario(
    browser, "A_riseAndPass",
    [
      { t0: 2, char: "fb", tp: [1000, 572.8] },
      { t0: 30, t1: 112, char: "fb", walk: -1 },   // 东行上按钮
      { t0: 200, t1: 240, char: "fb", walk: 1 },   // 西行回 (经 1045→...) 到柱东
      { t0: 240, t1: 400, char: "fb", walk: 1 },   // 继续西行穿柱位
    ],
    480, 330
  );

  // B: 对照，柱不升。fb 站 row18 东段 (780,540.8)?? 用 760: feet 576? row18 top 576 → center 540.8。东行(walk:-1)向柱 → 挡在 749.7
  //    再试西段: fb 站西段 (500,540.8) 西行→东行撞柱。
  results.B = await runScenario(
    browser, "B_blocked",
    [
      { t0: 2, char: "fb", tp: [500, 540.8] },
      { t0: 30, t1: 130, char: "fb", walk: -1 },   // 东行撞柱
    ],
    260
  );

  // C: fb 板顶 (250,412.8) 东行(walk:-1) 穿 x=272 → P6→P7
  results.C = await runScenario(
    browser, "C_slabP6",
    [
      { t0: 2, char: "fb", tp: [250, 412.8] },
      { t0: 40, t1: 130, char: "fb", walk: -1 },   // 东行穿 272
      { t0: 220, t1: 300, char: "fb", walk: -1 },  // 门台上继续东行（去 fb 门 448）
    ],
    420
  );

  // D: fb 杆西 (430,700.8) 东行(walk:-1) 推杆 → P2/P3
  results.D = await runScenario(
    browser, "D_lever",
    [
      { t0: 2, char: "fb", tp: [430, 700.8] },
      { t0: 30, t1: 140, char: "fb", walk: -1 },   // 东行推杆
    ],
    300
  );

  await browser.close();
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

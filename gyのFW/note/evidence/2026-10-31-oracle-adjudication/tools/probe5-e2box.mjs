// probe5-e2box.mjs — crystal_03 oracle 补链（8871 只读）
//  E2: 真实推杆(walk 东行进杆, probe3-D 已证) → fb 走回台西端起跳 → P3 凹龛(杆开) → P2 出口 → 落 row-6
//  I : box 腿——fb 在 row10 西推 box 落 row19 → 东推 box 上 pusher 按钮 → tr>0.2 持续 → 柱升至 tr=-3，
//      无人踩按钮（box 锁存）——验证「箱压按钮破双角色死锁」
// 产出: TEMP/fw-oc-8871/probe5-out.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe5-out.json";

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
        if (t === 'box') {
          var bp = d.body.data.GetPosition();
          s.box = { x: Math.round(-bp.x * 32 * 100) / 100, y: Math.round(-bp.y * 32 * 100) / 100 };
        }
        if (t === 'portal' && d.options.properties.portalId === 2) s['p2state'] = d.state;
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
        out.platform = {
          type: bd.GetType(), mass: bd.GetMass(), pos: V2S(bd.GetPosition()), tr: d.joint.GetJointTranslation(),
          fixtures: (function () { var a = [], fx = bd.GetFixtureList(); while (fx) { var sh = fx.GetShape(), vs = []; for (var i = 0; i < sh.m_count; i++) { var w = box2d.b2MulXV(bd.GetTransform(), sh.m_vertices[i], new box2d.b2Vec2()); vs.push(V2S(w)); } a.push(vs); fx = fx.GetNext(); } return a; })(),
        };
      }
      if (d.options.type === 'box') {
        var bb = d.body.data;
        var fx = bb.GetFixtureList(), vs = [];
        for (var i = 0; i < fx.GetShape().m_count; i++) { var w = box2d.b2MulXV(bb.GetTransform(), fx.GetShape().m_vertices[i], new box2d.b2Vec2()); vs.push(V2S(w)); }
        out.box = { pos: V2S(bb.GetPosition()), mass: bb.GetMass(), verts: vs };
      }
    });
    var c = g.physics.box2d.world.GetContactList(), contacts = [];
    while (c) {
      try {
        var sa = V2S(c.m_fixtureA.m_body.GetPosition()), sb = V2S(c.m_fixtureB.m_body.GetPosition());
        if (Math.abs(sb.x - 720) < 40 && Math.abs(sb.y - 432) < 90) contacts.push({ touching: c.IsTouching(), other: c.m_fixtureA.m_body.m_userData, platScreen: sb });
        if (Math.abs(sa.x - 720) < 40 && Math.abs(sa.y - 432) < 90) contacts.push({ touching: c.IsTouching(), other: c.m_fixtureB.m_body.m_userData, platScreen: sa });
      } catch (e) {}
      c = c.m_next;
    }
    out.contactsNearPlatform = contacts;
    return out;
  };
})();`;

async function runScenario(browser, name, plan, maxFrames, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log(`[${name}][pageerror]`, String(e).slice(0, 200)); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(500);
  await page.evaluate(INSTALL);
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = ${maxFrames}; window.__rec.frame = 0;`);
  if (opts.dumpAt) await page.waitForFunction(`(() => { try { return window.__rec.frame >= ${opts.dumpAt}; } catch { return false; } })()`, null, { timeout: 180000, polling: 50 });
  const mech = opts.dumpAt ? await page.evaluate("window.__dumpMech()") : null;
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 300000, polling: 100 });
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
  const results = {};

  // E2: fb 推杆(真实) → 回西端 → 起跳入 P3 凹龛 → P2 → 落 row-6
  results.E2 = await runScenario(
    browser, "E2_leverP3",
    [
      { t0: 2, char: "fb", tp: [430, 700.8] },
      { t0: 30, t1: 56, char: "fb", walk: -1 },   // 东行进杆 → 杆翻 (probe3-D)
      { t0: 56, t1: 175, char: "fb", walk: 1 },   // 西行回台西端 (clamp ~79.4)
      { t0: 175, char: "fb", jump: 1 },           // 西端起跳 → 中心带 x[13.1,50.9] y[576,672] → P3
      { t0: 175, t1: 205, char: "fb", walk: 1 },  // 空中保持西推
      { t0: 215, t1: 250, char: "fb", walk: 1 },  // 落地后继续西行 (row-6 上)
    ],
    320
  );

  // I: box 腿——row10 西推 box 落 row19 → 东推 box 上按钮 → box 锁存柱升
  results.I = await runScenario(
    browser, "I_boxLatch",
    [
      { t0: 2, char: "fb", tp: [1020, 284.8] },   // row10 顶 320, box 在 (960,290)
      { t0: 30, t1: 58, char: "fb", walk: 1 },    // 西推 box 至边缘落下
      { t0: 78, t1: 90, char: "fb", walk: 1 },    // fb 随后走离 row10 西缘
      { t0: 100, t1: 165, char: "fb", walk: -1 }, // row19 上东推 box 向按钮
      { t0: 165, t1: 175, char: "fb", walk: -1 }, // 缓冲 (fb 停在 ~1135, box 上按钮)
    ],
    420,
    { dumpAt: 380 }
  );

  await browser.close();
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

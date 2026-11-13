// probe4-links.mjs — crystal_03 oracle 剩余链路验证（8871 只读）
//  E: 杆开→fb 从 y736 台西端跳入 P3 凹龛 → 传 P2(1216,112) 落 row-6
//  F: fb 站 [0,96]顶512 (40,476.8) 东行+东缘起跳 → 上 row-14 板
//  G: fb 走上按钮停住(保持) → 柱升 → wg row18 东段西行穿 x=720 → 西段；mech dump 验证柱/板重叠
//  H: (G 后段) fb 离开按钮 → 柱回落（验证不锁存）
// 产出: TEMP/fw-oc-8871/probe4-out.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe4-out.json";

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
        if (t === 'portal' && d.options.properties.portalId === 2) s['p2open'] = d.state;
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
    });
    var gb = L2.groundBody;
    (function () {
      var fx = gb.GetFixtureList();
      while (fx) {
        var sh = fx.GetShape(), vs = [];
        for (var i = 0; i < sh.m_count; i++) { var w = box2d.b2MulXV(gb.GetTransform(), sh.m_vertices[i], new box2d.b2Vec2()); vs.push(V2S(w)); }
        var xs = vs.map(function (v) { return v.x; }), ys = vs.map(function (v) { return v.y; });
        var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
        if (x0 > 690 && x1 < 820 && y0 > 400 && y1 < 460) out.board = { aabb: [x0, x1, y0, y1] };
        fx = fx.GetNext();
      }
    })();
    var c = g.physics.box2d.world.GetContactList(), contacts = [];
    while (c) {
      try {
        var pa = c.m_fixtureA.m_body.GetPosition(), pb = c.m_fixtureB.m_body.GetPosition();
        var sa = V2S(pa), sb = V2S(pb);
        if (Math.abs(sb.x - 720) < 40 && Math.abs(sb.y - 432) < 90) contacts.push({ touching: c.IsTouching(), other: c.m_fixtureA.m_body.m_userData, platScreen: sb });
        if (Math.abs(sa.x - 720) < 40 && Math.abs(sa.y - 432) < 90) contacts.push({ touching: c.IsTouching(), other: c.m_fixtureB.m_body.m_userData, platScreen: sa });
      } catch (e) {}
      c = c.m_next;
    }
    out.contactsNearPlatform = contacts;
    return out;
  };
  window.__leverOpen = function () {
    // 直接把 group2 杆扳到 state1（探针 E 免去推杆环节，行为验证见 probe3-D）
    var L2 = g.level;
    L2.objects.forEach(function (d) { if (d.options.type === 'lever') { d.state = 1; d.joint.SetMotorSpeed(-4 * d.options.properties.onis); } });
  };
})();`;

async function runScenario(browser, name, plan, maxFrames, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => console.log(`[${name}][pageerror]`, String(e).slice(0, 200)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(500);
  await page.evaluate(INSTALL);
  if (opts.preEval) await page.evaluate(opts.preEval);
  await page.evaluate(`window.__ctrl.plan = ${JSON.stringify(plan)}; window.__ctrl.maxFrames = ${maxFrames}; window.__rec.frame = 0;`);
  if (opts.dumpAt) await page.waitForFunction(`(() => { try { return window.__rec.frame >= ${opts.dumpAt}; } catch { return false; } })()`, null, { timeout: 150000, polling: 50 });
  const mech = opts.dumpAt ? await page.evaluate("window.__dumpMech()") : null;
  await page.waitForFunction("(() => { try { return window.__rec && window.__rec.done; } catch { return false; } })()", null, { timeout: 240000, polling: 100 });
  const rec = await page.evaluate("window.__rec");
  console.log(`[${name}] frames=${rec.frame} events=${rec.events.length}`);
  rec.events.slice(0, 10).forEach((e) => console.log(`   ev f${e.f} ${e.char} ${e.kind} (${e.from && e.from.x},${e.from && e.from.y}) -> (${e.to && e.to.x},${e.to && e.to.y})`));
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

  // E: 杆直开（行为已由 probe3-D 验证）→ fb 站 y736 台西端 (90,700.8) 西行至边沿起跳向左上漂 → P3 凹龛
  results.E = await runScenario(
    browser, "E_p3pocket",
    [
      { t0: 2, char: "fb", tp: [100, 700.8] },
      { t0: 30, t1: 58, char: "fb", walk: 1 },      // 西行至台西端 (x≈64)
      { t0: 58, char: "fb", jump: 1 },              // 边沿起跳
      { t0: 58, t1: 90, char: "fb", walk: 1 },      // 空中保持西推
    ],
    300,
    { preEval: "window.__leverOpen()" }
  );

  // F: fb 站 [0,96] 顶 512 (40,476.8) → 东行(walk:-1)至东缘起跳(f~48 at x≈88) → 上 row-14 板
  results.F = await runScenario(
    browser, "F_blockJump",
    [
      { t0: 2, char: "fb", tp: [40, 476.8] },
      { t0: 30, t1: 49, char: "fb", walk: -1 },
      { t0: 49, char: "fb", jump: 1 },
      { t0: 49, t1: 75, char: "fb", walk: -1 },
    ],
    300
  );

  // G: fb 走上按钮停住 → 柱升 → wg row18 东段西行穿 x=720 → 西段；f330 mech dump；f400 fb 离开按钮(柱回落)
  results.G = await runScenario(
    browser, "G_passUnder",
    [
      { t0: 2, char: "fb", tp: [1000, 572.8] },
      { t0: 30, t1: 44, char: "fb", walk: -1 },    // 东行 ~64px → 停在按钮上 (x≈1064)
      { t0: 60, char: "wg", tp: [780, 540.8] },    // wg 上 row18 东段
      { t0: 90, t1: 220, char: "wg", walk: 1 },    // 西行穿 720 → 西段 (780→~290)
      { t0: 400, t1: 415, char: "fb", walk: 1 },   // fb 西行离开按钮 → 柱回落
    ],
    560,
    { dumpAt: 330 }
  );

  await browser.close();
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

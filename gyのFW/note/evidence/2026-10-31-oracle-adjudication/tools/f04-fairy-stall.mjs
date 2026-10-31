// f04-fairy-stall.mjs — 诊断仙女在出生袋 x≈1160 的卡滞：拖拽目标 (1160,905)，200 帧后倾倒
// 仙女的所有接触体（fixture userData / 类型）+ 附近动态体实时位置。
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";

const READY = `(() => { try { var g = Phaser.GAMES[0]; if (!g || !g.progress || !g.progress.get) return false; var ts = g.progress.get('temples'); return !!(ts && ts.length && ts[0].levels && ts[0].levels.length > 5); } catch (e) { return false; } })()`;
const READY_LEVEL = `(() => { try { var L = Phaser.GAMES[0].level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { return Phaser.GAMES[0].physics.box2d.paused === false; } catch { return false; } })()`;
const NAVIGATE = `(function () {
  var g = Phaser.GAMES[0];
  var temple = g.progress.get('temples').find(function (t) { return t.id === 'fairytales'; }) || g.progress.get('temples')[0];
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('fairies-01') >= 0; });
  g.currentTemple = temple;
  var Level = require('States/Level/Level');
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return levelData.filename;
})()`;

const RUN = `(function () {
  var g = Phaser.GAMES[0];
  var plugin = g.physics.box2d;
  var h = window.__h = { t: 0, log: [], done: false };
  var timer = setInterval(function () {
    var pl = g.physics && g.physics.box2d;
    if (!pl || h.installed) return;
    clearInterval(timer); h.installed = true; h.cur = pl.update;
    Object.defineProperty(pl, 'update', {
      configurable: true,
      get: function () { var me = this; return function () {
        me.game.time.elapsed = 1000 / 60;
        var r = h.cur.apply(this, arguments);
        try { step.call(this); } catch (e) { h.err = String(e); h.done = true; }
        return r; }; },
      set: function (v) { h.cur = v; },
    });
  }, 8);
  function step() {
    var L = g.level;
    if (!L || !L.loadCompleted || !L.fairies || plugin.paused) return;
    h.t++;
    var fy = L.fairies[0];
    if (h.t >= 30 && h.t <= 400) {
      fy.dragging = true;
      fy.dragTarget.x = -1160 / 32; fy.dragTarget.y = -905 / 32;
    }
    if (h.t % 40 === 0) {
      var p = fy.body.data.GetPosition();
      var rec = { f: h.t, fy: [Math.round(-p.x * 32 * 10) / 10, Math.round(-p.y * 32 * 10) / 10], contacts: [] };
      for (var cl = fy.body.data.GetContactList(); cl; cl = cl.next) {
        var c = cl.contact;
        var fA = c.GetFixtureA(), fB = c.GetFixtureB();
        var other = (fA.GetBody() === fy.body.data) ? fB : fA;
        var ob = other.GetBody();
        var op = ob.GetPosition();
        rec.contacts.push({ ud: String(other.m_userData), type: other.GetShape().GetType(), at: [Math.round(-op.x * 32), Math.round(-op.y * 32)] });
      }
      h.log.push(rec);
    }
    if (h.t >= 400) {
      // 倾倒附近动态体
      h.nearby = [];
      (L.objects || []).forEach(function (o, i) {
        if (o.body && o.body.data) {
          var p = o.body.data.GetPosition();
          var sx = -p.x * 32, sy = -p.y * 32;
          if (sx > 1000 && sx < 1300 && sy > 700) h.nearby.push({ i: i, type: o.options && o.options.type, at: [Math.round(sx), Math.round(sy)], w: o.options && o.options.w, h2: o.options && o.options.h });
        }
      });
      var bxs = [];
      for (var b = g.physics.box2d.world.GetBodyList(); b; b = b.GetNext()) {
        if (b.GetType() === box2d.b2BodyType.b2_dynamicBody) {
          var bp = b.GetPosition();
          var bx = -bp.x * 32, by = -bp.y * 32;
          if (bx > 1000 && bx < 1300 && by > 700 && by < 1000) {
            var fxs = [];
            for (var f = b.GetFixtureList(); f; f = f.GetNext()) {
              var sh = f.GetShape();
              var info = { ud: String(f.m_userData), t: sh.GetType() };
              if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
                info.vs = sh.m_vertices.map(function (v) { return [Math.round(v.x * 32 * 10) / 10, Math.round(-v.y * 32 * 10) / 10]; });
              } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape) { info.r = Math.round(sh.m_radius * 32 * 10) / 10; }
              fxs.push(info);
            }
            bxs.push({ at: [Math.round(bx * 10) / 10, Math.round(by * 10) / 10], ang: Math.round(b.GetAngle() * 100) / 100, fx: fxs });
          }
        }
      }
      h.bodies = bxs;
      h.done = true;
    }
  }
  return 'ok';
})()`;

async function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY, null, { timeout: 90000, polling: 250 });
  await page.waitForFunction("Phaser.GAMES[0].state.current === 'menu'", null, { timeout: 60000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 50 });
  await page.evaluate(RUN);
  await page.waitForFunction("window.__h && window.__h.done", null, { timeout: 120000, polling: 100 });
  const data = await page.evaluate("({ t: window.__h.t, err: window.__h.err, log: window.__h.log, nearby: window.__h.nearby, bodies: window.__h.bodies })");
  await browser.close();
  writeFileSync(`${OUTDIR}/f04-fairy-stall.json`, JSON.stringify(data));
  console.log("frames:", data.t, "err:", data.err);
  data.log.forEach((r) => console.log(JSON.stringify(r)));
  console.log("nearby objects:", JSON.stringify(data.nearby));
  console.log("dynamic bodies near pocket:", JSON.stringify(data.bodies, null, 1));
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

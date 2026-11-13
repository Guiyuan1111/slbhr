// f06-bumpjump.mjs — 诊断：wg 站 bump 平顶起跳东漂为何衰减？逐帧 x/y/vx/vy + 接触体名。
// 用法: node f06-bumpjump.mjs [takeoffX]  (默认 1000)
// 产出: TEMP/fw-of-1/f06-bumpjump.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";
const TAKEOFF = Number(process.argv[2] || 1000);

const READY = `(() => { try { var g = Phaser.GAMES[0]; if (!g || !g.progress || !g.progress.get) return false; var ts = g.progress.get('temples'); return !!(ts && ts.length && ts[0].levels && ts[0].levels.length > 5); } catch (e) { return false; } })()`;
const READY_LEVEL = `(() => { try { var L = Phaser.GAMES[0].level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.groundBody); } catch { return false; } })()`;
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

const INSTALL = `(function () {
  var g = Phaser.GAMES[0];
  var plugin = g.physics.box2d;
  var h = window.__h = { t: 0, samples: [], events: [], done: false };
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
  }, 16);
  function V(x, y) { return new box2d.b2Vec2(x, y); }
  function bodyName(o) {
    try {
      var ud = o.GetUserData && o.GetUserData();
      if (!ud) return 'ground?';
      if (ud.constructor && ud.constructor.name) return ud.constructor.name;
      return JSON.stringify(ud).slice(0, 50);
    } catch (e) { return 'err'; }
  }
  function step() {
    var g = Phaser.GAMES[0], L = g.level;
    if (!L || !L.loadCompleted || !L.pers2 || g.physics.box2d.paused) return;
    h.t++;
    var b = L.pers2.body.data;
    if (h.t === 30) {
      b.SetPosition(V(-(${TAKEOFF}) / 32, -(896 - 35.5) / 32));
      b.SetLinearVelocity(V(0, 0));
      h.events.push({ f: h.t, tp: ${TAKEOFF} });
    }
    if (h.t === 120) {
      b.SetLinearVelocity(V(-8.5, 16.5));
      h.events.push({ f: h.t, jump: 1 });
    }
    if (h.t >= 120 && h.t <= 300) {
      var p = b.GetPosition(), v = b.GetLinearVelocity();
      var contacts = [];
      var cl = b.GetContactList();
      while (cl) {
        try { if (cl.contact && cl.contact.IsTouching()) contacts.push(bodyName(cl.other)); } catch (e) {}
        cl = cl.next;
      }
      h.samples.push({
        f: h.t,
        x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100,
        vx: Math.round(-v.x * 32 * 100) / 100, vy: Math.round(-v.y * 32 * 100) / 100,
        c: contacts.join('|'),
      });
    }
    if (h.t > 320) h.done = true;
  }
})()`;

mkdirSync(OUTDIR, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(READY, null, { timeout: 90000 });
await page.evaluate(NAVIGATE).then(console.log);
await page.waitForFunction(READY_LEVEL, null, { timeout: 60000 });
await page.evaluate(INSTALL);
await page.waitForFunction(() => window.__h && window.__h.done, null, { timeout: 90000 });
const out = await page.evaluate(() => ({ t: window.__h.t, err: window.__h.err || "", events: window.__h.events, samples: window.__h.samples }));
writeFileSync(OUTDIR + "/f06-bumpjump.json", JSON.stringify(out, null, 1));
console.log("frames=" + out.t, out.err, "samples=" + out.samples.length);
await browser.close();

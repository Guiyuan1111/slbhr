// f07-standable.mjs — 终判实验：传送 wg 至各候选平台顶，60f 后记录是否站稳（feet 保持 & 无坠落）。
// 判定Oracle 实体表面集合，裁决西线爬升各段的可行性。
// 用法: node f07-standable.mjs
// 产出: TEMP/fw-of-1/f07-standable.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";

// [标签, x, feet] — 全部取平台顶的理论站立值
const SPOTS = [
  ["R17L-west@150", 150, 544],
  ["R17L-west@60", 60, 544],
  ["r16@600", 600, 512],
  ["ledgeA@480", 480, 480],
  ["ledgeB@460", 460, 448],
  ["R13L@300", 300, 416],
  ["r11R@1150", 1150, 352],
  ["r9@900", 900, 288],
  ["R7@300", 300, 224],
  ["R6R@1150", 1150, 192],
  ["R4@700", 700, 128],
  ["step@640", 640, 704],
  ["r19@850", 850, 608],
  ["R14E@800", 800, 448],
];

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
  var h = window.__h = { t: 0, spots: [], done: false, idx: -1 };
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
  function step() {
    var g = Phaser.GAMES[0], L = g.level;
    if (!L || !L.loadCompleted || !L.pers2 || g.physics.box2d.paused) return;
    h.t++;
    var SPOTS = ${JSON.stringify(SPOTS)};
    var st = h.st;
    if (!st) {
      h.idx++;
      if (h.idx >= SPOTS.length) { h.done = true; return; }
      var sp = SPOTS[h.idx];
      var b = L.pers2.body.data;
      b.SetPosition(V(-sp[1] / 32, -(sp[2] - 35.5) / 32));
      b.SetLinearVelocity(V(0, 0));
      h.st = { sp: sp, t0: h.t };
      h.events = h.events || []; h.events.push({ f: h.t, tp: sp });
      return;
    }
    var p = L.pers2.body.data.GetPosition(), v = L.pers2.body.data.GetLinearVelocity();
    var x = -p.x * 32, y = -p.y * 32, feet = y + 35.5;
    var t = h.t - st.t0;
    if (t % 10 === 0) (h.trace = h.trace || []).push({ f: h.t, sp: st.sp[0], x: Math.round(x * 10) / 10, feet: Math.round(feet * 10) / 10 });
    if (L.pers2.isDead) { h.spots.push({ sp: st.sp[0], verdict: 'dead', feet: Math.round(feet) }); h.st = null; return; }
    if (t >= 60) {
      var drift = Math.abs(x - st.sp[1]);
      var hold = Math.abs(feet - st.sp[2]) < 8 && Math.abs(v.y) < 60;
      h.spots.push({ sp: st.sp[0], verdict: hold ? 'STANDS' : (feet > st.sp[2] + 40 ? 'FELL' : 'drift/slide'), feet: Math.round(feet * 10) / 10, drift: Math.round(drift * 10) / 10 });
      h.st = null;
    }
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
await page.waitForFunction(() => window.__h && window.__h.done, null, { timeout: 120000 });
const out = await page.evaluate(() => ({ spots: window.__h.spots, err: window.__h.err || "", trace: (window.__h.trace || []).slice(-80) }));
writeFileSync(OUTDIR + "/f07-standable.json", JSON.stringify(out, null, 1));
out.spots.forEach(s => console.log(s.sp.padEnd(16), s.verdict, "feet=" + s.feet, s.drift != null ? "drift=" + s.drift : ""));
await browser.close();

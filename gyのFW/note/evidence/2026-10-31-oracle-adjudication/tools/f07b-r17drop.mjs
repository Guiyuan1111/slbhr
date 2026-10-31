// f07b-r17drop.mjs — R17L-west 顶面捕获条件：不同下落高度/速度落到 feet 544 是否被接住。
// 背景：f07 传送置放=STANDS，但动态走落 R21L 西缘观测到穿透(落到 R25L 800)。
// 本探针判定「顶面能否接住坠落体」，决定 M3(R21L→R17L) 是否可行。
// 用法: node f07b-r17drop.mjs
// 产出: TEMP/fw-of-1/f07b-r17drop.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";

// 用例: id, 屏幕x, 起始feet, 初速vx(wu/s, +8.5=西向漂移同walk档)
const DROPS = [
  { id: "drop8", x: 150, feet: 552, vx: 0 },
  { id: "drop24", x: 150, feet: 568, vx: 0 },
  { id: "drop64", x: 150, feet: 608, vx: 0 },
  { id: "drop128", x: 150, feet: 672, vx: 0 },
  { id: "drop128walk", x: 170, feet: 672, vx: 8.5 }, // 站 R21L 西缘带速走落（复刻真实走落）
  { id: "drop300", x: 150, feet: 244, vx: 0 },
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
  var h = window.__h = { t: 0, spots: [], done: false, idx: -1, trace: [] };
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
  var DROPS = ${JSON.stringify(DROPS)};
  function step() {
    var g = Phaser.GAMES[0], L = g.level;
    if (!L || !L.loadCompleted || !L.pers2 || g.physics.box2d.paused) return;
    h.t++;
    if (!h.st) {
      h.idx++;
      if (h.idx >= DROPS.length) { h.done = true; return; }
      var sp = DROPS[h.idx];
      var b = L.pers2.body.data;
      b.SetPosition(V(-sp.x / 32, -(sp.feet - 35.5) / 32));
      b.SetLinearVelocity(V(sp.vx, 0));
      h.st = { sp: sp, t0: h.t };
      return;
    }
    var p = L.pers2.body.data.GetPosition(), v = L.pers2.body.data.GetLinearVelocity();
    var feet = -p.y * 32 + 35.5;
    var px = -p.x * 32;
    var t = h.t - h.st.t0;
    if (t % 4 === 0) h.trace.push({ f: h.t, id: h.st.sp.id, feet: Math.round(feet * 10) / 10, x: Math.round(px * 10) / 10, vy: Math.round(v.y * 32 * 10) / 10 });
    if (t >= 90) {
      var verdict;
      if (Math.abs(feet - 544) < 8) verdict = 'CAUGHT';
      else if (feet > 556 && feet < 780) verdict = 'STUCK-MID';
      else verdict = 'PASSED';
      h.spots.push({ id: h.st.sp.id, verdict: verdict, feet: Math.round(feet * 10) / 10, x: Math.round(px * 10) / 10 });
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
const out = await page.evaluate(() => ({ spots: window.__h.spots, trace: window.__h.trace, err: window.__h.err }));
writeFileSync(OUTDIR + "/f07b-r17drop.json", JSON.stringify(out, null, 1));
out.spots.forEach(s => console.log(s.id.padEnd(12), s.verdict, "feet=" + s.feet, "x=" + s.x));
if (out.err) console.log("ERR:", out.err);
await browser.close();

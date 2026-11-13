// f08-capjump.mjs — R21L(672) 东向满跳跨越 r17E 填充西面 x608，落 r17E 露顶唇 [608,672]@544。
// 判定 oracle 东侧上行链 R21L→r17E→r19 是否物理可行（char 常规玩法）。
// 用例均 SetAwake(true)（修复 f07b 睡眠伪影）。
// 用法: node f08-capjump.mjs
// 产出: TEMP/fw-of-1/f08-capjump.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";

// id, 起跳x, 起跳feet, vx(wu/s 负=东漂), hold(空中每帧重apply的帧数)
const CASES = [
  { id: "A1-x496-h26", x: 496, feet: 672, vx: -8.5, hold: 26 },
  { id: "A2-x504-h26", x: 504, feet: 672, vx: -8.5, hold: 26 },
  { id: "A3-x512-h26", x: 512, feet: 672, vx: -8.5, hold: 26 },
  { id: "A4-x500-h22", x: 500, feet: 672, vx: -8.5, hold: 22 },
  { id: "A5-x500-h30", x: 500, feet: 672, vx: -8.5, hold: 30 },
  { id: "B1-x556-h26", x: 556, feet: 672, vx: -8.5, hold: 26 }, // 预测撞填充西面(对照)
  { id: "C1-lipwalk", x: 640, feet: 544, vx: -8.5, hold: 0, walk: 90 }, // 唇顶东行走落 ◣→r18→r19
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

function installSrc(c) {
  return `(function () {
  var g = Phaser.GAMES[0];
  var plugin = g.physics.box2d;
  var CASE = ${JSON.stringify(c)};
  var h = window.__h = { t: 0, trace: [], done: false, dead: false, phase: "tp", holdLeft: 0, walkLeft: CASE.walk || 0, minFeet: 9999 };
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
    if (!L || !L.loadCompleted || !L.pers2) return;
    if (g.physics.box2d.paused) {
      if (!h.everRan) return; // 开局 intro 冻结，非死亡
      h.dead = true; h.done = true; return;
    }
    h.everRan = true;
    h.t++;
    var b = L.pers2.body.data;
    var p = b.GetPosition(), v = b.GetLinearVelocity();
    var feet = -p.y * 32 + 35.5, px = -p.x * 32;
    if (h.phase === "tp") {
      b.SetAwake(true);
      b.SetPosition(V(-CASE.x / 32, -(CASE.feet - 35.5) / 32));
      b.SetLinearVelocity(V(0, 0));
      h.tpT = h.t; h.phase = "settle";
      return;
    }
    if (h.phase === "settle") {
      if (h.t - h.tpT >= 40) {
        h.phase = "air"; h.jT = h.t; h.holdLeft = CASE.hold;
        b.SetAwake(true);
        b.SetLinearVelocity(V(CASE.vx, 16.5));
      }
      return;
    }
    if (h.phase === "air") {
      if (h.holdLeft > 0) { h.holdLeft--; b.SetLinearVelocity(V(CASE.vx, v.y)); }
      if (feet < h.minFeet) h.minFeet = feet;
      if (h.t % 2 === 0) h.trace.push({ f: h.t - h.jT, feet: Math.round(feet * 10) / 10, x: Math.round(px * 10) / 10, vy: Math.round(v.y * 32) });
      var grounded = Math.abs(v.y * 32) < 12 && h.t - h.jT > 25;
      if ((grounded && h.t - h.jT > 40) || h.t - h.jT >= 140) {
        if (h.walkLeft > 0) { h.phase = "walk"; }
        else { h.res = { feet: Math.round(feet * 10) / 10, x: Math.round(px * 10) / 10, minFeet: Math.round(h.minFeet * 10) / 10 }; h.done = true; }
      }
      return;
    }
    if (h.phase === "walk") {
      b.SetLinearVelocity(V(CASE.vx, v.y));
      h.walkLeft--;
      if (h.t % 4 === 0) h.trace.push({ f: h.t - h.jT, feet: Math.round(feet * 10) / 10, x: Math.round(px * 10) / 10, vy: Math.round(v.y * 32) });
      if (h.walkLeft <= 0 || Math.abs(v.y * 32) < 5) {
        h.res = { feet: Math.round(feet * 10) / 10, x: Math.round(px * 10) / 10, minFeet: Math.round(h.minFeet * 10) / 10 };
        h.done = true;
      }
    }
  }
})()`;
}

mkdirSync(OUTDIR, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const c of CASES) {
  const page = await browser.newPage();
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY, null, { timeout: 90000 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000 });
  await page.evaluate(installSrc(c));
  await page.waitForFunction(() => window.__h && window.__h.done, null, { timeout: 60000 }).catch(() => {});
  const out = await page.evaluate(() => ({ res: window.__h.res, dead: window.__h.dead, err: window.__h.err, trace: window.__h.trace }));
  results.push({ id: c.id, ...out });
  console.log(c.id.padEnd(14), out.dead ? "DEAD" : (out.res ? `feet=${out.res.feet} x=${out.res.x} minFeet=${out.res.minFeet}` : "NO-RES"), out.err || "");
  await page.close();
}
writeFileSync(OUTDIR + "/f08-capjump.json", JSON.stringify(results, null, 1));
await browser.close();

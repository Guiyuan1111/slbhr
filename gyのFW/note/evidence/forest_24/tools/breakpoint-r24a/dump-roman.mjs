// r24a: dump roman/box fixtures from ORIGINAL engine (8791) — exact geometry diff vs kernel
// usage: node TEMP/r24a/dump-roman.mjs
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8791/gameIndex.html";

const DUMP = `(function () {
  var g = require('Phaser').GAMES[0], L = g.level;
  var Roman = require('States/Level/Devices/Roman');
  var Box = require('States/Level/Devices/Box');
  function dumpBody(b, tag) {
    if (!b) return { tag: tag, missing: true };
    var out = { tag: tag, pos: [b.GetPosition().x, b.GetPosition().y], angle: b.GetAngle(),
      type: b.GetType(), mass: b.GetMass(), fixtures: [] };
    for (var f = b.GetFixtureList(); f; f = f.GetNext()) {
      var sh = f.GetShape(), verts = null;
      if (sh.m_vertices) verts = sh.m_vertices.map(function (v) { return [v.x, v.y]; });
      var fd = f.GetFilterData();
      out.fixtures.push({ verts: verts, friction: f.GetFriction(), restitution: f.GetRestitution(),
        density: f.GetDensity(), sensor: f.IsSensor(),
        cat: fd.categoryBits, mask: fd.maskBits });
    }
    return out;
  }
  var romans = [], boxes = [];
  (L.objects || []).forEach(function (d) {
    if (d instanceof Roman) romans.push(d);
    if (d instanceof Box) boxes.push(d);
  });
  var res = { romans: [], boxes: [] };
  romans.forEach(function (r, i) {
    var bar = r.joint.GetBodyA(), base = r.joint.GetBodyB();
    res.romans.push({
      idx: i,
      bar: dumpBody(bar, 'bar'),
      base: dumpBody(base, 'base'),
      jointAnchor: (function(){var v=r.joint.GetAnchorA(new box2d.b2Vec2());return [v.x,v.y];})(),
      optsPoly: r.options ? r.options.polygon : null,
      optsXY: r.options ? [r.options.x, r.options.y] : null,
    });
  });
  boxes.forEach(function (b, i) {
    var bd = b.sprite && b.sprite.body ? b.sprite.body.data : (b.body ? b.body.data : null);
    res.boxes.push({ idx: i, body: dumpBody(bd, 'box'), opts: b.options ? { x: b.options.x, y: b.options.y, type: b.options.type } : null });
  });
  return res;
})()`;

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--disable-background-timer-throttling"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
await page.addInitScript(`window.__origLog = console.log.bind(console);`);
await page.route("**/*", (route) => {
  const u = route.request().url();
  if (!u.startsWith("http://127.0.0.1:8791")) return route.abort();
  if (/\.mp3(\?|$)/.test(u)) return route.abort();
  return route.continue();
});
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(`(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`, null, { timeout: 90000, polling: 250 });
// 进入 forest_24
await page.evaluate(`(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_24.json') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
})()`);
await page.waitForFunction(`(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`, null, { timeout: 60000, polling: 100 });
// 立即 dump（Step 前初始几何）
const dump0 = await page.evaluate(DUMP);
// 再跑 120 帧（约 2s）让其沉降后 dump
await page.waitForTimeout(2500);
const dump1 = await page.evaluate(DUMP);
console.log(JSON.stringify({ t0: dump0, t120: dump1 }, null, 1));
await browser.close();

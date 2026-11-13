// 03-geom.mjs — 校准 world↔screen 变换并倾倒全部地面多边形（世界系 AABB 实测）
// 产出: TEMP/fw-oe-1/geom.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8873/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oe-1/geom.json";

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'fire'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('tutorial_fire') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return levelData.filename;
})()`;

const PROBE = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var out = {};
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  var plugin = g.physics.box2d;
  var world = plugin.world;
  // ground body transform
  var gb = L.groundBody;
  var xf = gb.GetTransform();
  var q = xf.q;
  out.groundXf = { p: { x: r4(xf.p.x), y: r4(xf.p.y) }, c: r4(q.c), s: r4(q.s) };
  function localToWorld(v) {
    return { x: xf.p.x + q.c * v.x - q.s * v.y, y: xf.p.y + q.s * v.x + q.c * v.y };
  }
  // all ground fixtures -> world verts
  var fxs = [];
  for (var f = gb.GetFixtureList(); f; f = f.GetNext()) {
    var sh = f.GetShape();
    if (sh.GetType() !== box2d.b2ShapeType.e_polygonShape) { fxs.push({ kind: 'other' }); continue; }
    var vs = [];
    var n = sh.m_count || sh.m_vertices.length;
    for (var i = 0; i < n; i++) {
      var w = localToWorld(sh.m_vertices[i]);
      vs.push([r4(w.x), r4(w.y)]);
    }
    fxs.push({ vs: vs, fric: r4(f.GetFriction()), sensor: !!f.IsSensor(), ud: f.GetUserData() == null ? null : String(f.GetUserData()) });
  }
  out.fixtures = fxs;
  // fb body info
  var P = L.pers1;
  var pp = P.body.data.GetPosition();
  out.fb = { wx: r4(pp.x), wy: r4(pp.y), spriteX: r4(P.sprite.x), spriteY: r4(P.sprite.y) };
  // pure-math containment: which ground fixtures' world polys contain fb center + offsets
  function inside(pt, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if (((a[1] > pt[1]) !== (b[1] > pt[1])) && (pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }
  var pts = { center: [pp.x, pp.y], feet: [pp.x, pp.y + 0.7], feetL: [pp.x - 0.2, pp.y + 0.7], feetR: [pp.x + 0.2, pp.y + 0.7] };
  var under = {};
  Object.keys(pts).forEach(function (k) {
    under[k] = fxs.filter(function (f) { return f.vs && inside(pts[k], f.vs); }).map(function (f) { return { ud: f.ud, fric: f.fric, vs: f.vs }; });
  });
  out.underFb = under;
  return out;
})()`;

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oe-1", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1500);
  const dump = await page.evaluate(PROBE);
  writeFileSync(OUT, JSON.stringify(dump, null, 1));
  console.log("written:", OUT);
  console.log("groundXf:", JSON.stringify(dump.groundXf));
  console.log("fb:", JSON.stringify(dump.fb));
  console.log("hitsUnderFb:", JSON.stringify(dump.hitsUnderFb));
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

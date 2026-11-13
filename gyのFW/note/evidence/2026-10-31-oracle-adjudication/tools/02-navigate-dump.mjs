// 02-navigate-dump.mjs — 进入 oracle E 部 tutorial_fire，倾关运行时权威数据（只读观测）
// 产出: TEMP/fw-oe-1/level-dump.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8873/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oe-1/level-dump.json";

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
  return { filename: levelData.filename, temple: temple.id };
})()`;

const DUMP = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var out = {};
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function bodyScreen(b) {
    var p = b.GetPosition();
    return { wx: r4(p.x), wy: r4(p.y), sx: r4(p.x * 32), sy: r4(-p.y * 32) };
  }
  // chars
  ['pers1', 'pers2'].forEach(function (k) {
    var P = L[k];
    out[k] = {
      id: P.id || (P.data && P.data.char),
      screen: { x: r4(P.sprite.x), y: r4(P.sprite.y) },
      body: bodyScreen(P.body.data),
      vel: (function () { var v = P.body.data.GetLinearVelocity(); return { x: r4(v.x), y: r4(v.y) }; })(),
      jumpVelocity: P.jumpVelocity, jumpImpulse: P.jumpImpulse, runForce: P.runForce,
      floatForce: P.floatForce, maxSpeed: P.maxSpeed, defaultMaxSpeed: P.defaultMaxSpeed,
      absoluteMaxSpeed: P.absoluteMaxSpeed, feetFriction: P.feetFriction,
      mass: P.body.data.GetMass(),
      keys: { up: !!P.up, left: !!P.left, right: !!P.right },
      diamonds: P.data ? P.data.diamonds : null,
    };
  });
  // doors
  ['door1', 'door2'].forEach(function (k) {
    var D = L[k];
    if (!D) return;
    out[k] = { pos: D.pos, screen: { x: r4(D.sprite.x), y: r4(D.sprite.y) }, char: D.data && D.data.char, isOpen: !!D.isOpen, isUp: !!D.isUp };
  });
  // devices / objects
  out.objects = (L.objects || []).map(function (o, i) {
    var rec = { i: i, ctype: o.constructor && o.constructor.name || '?', options: JSON.parse(JSON.stringify(o.options || {})) };
    try { if (o.body && o.body.data) rec.body = bodyScreen(o.body.data); } catch (e) {}
    try { if (o.sprite) rec.sprite = { x: r4(o.sprite.x), y: r4(o.sprite.y) }; } catch (e) {}
    try { if (o.data) rec.data = JSON.parse(JSON.stringify(o.data)); } catch (e) {}
    try { if (o.pos) rec.pos = JSON.parse(JSON.stringify(o.pos)); } catch (e) {}
    return rec;
  });
  // ground fixtures (world-space polygons, screen = (x*32, -y*32), plus mirrored hypothesis)
  var fx = [];
  var gb = L.groundBody;
  for (var f = gb.GetFixtureList(); f; f = f.GetNext()) {
    var sh = f.GetShape();
    if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
      var vs = [];
      var n = sh.m_vertices.length;
      for (var vi = 0; vi < n; vi++) {
        var w = sh.m_vertices[vi];
        vs.push([r4(w.x * 32), r4(-w.y * 32)]);
      }
      fx.push({ vs: vs });
    } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape) {
      fx.push({ circle: { r: r4(sh.GetRadius() * 32) } });
    }
  }
  out.groundFixtures = fx;
  out.groundFixtureCount = fx.length;
  // other dynamic bodies summary
  out.totalDiamonds = L.totalDiamonds;
  out.levelFilename = L.levelData && L.levelData.filename;
  out.useDust = L.useDust;
  out.tutorialTexts = (L.tutorialTexts || []).length;
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
  console.log("progress ready");
  const nav = await page.evaluate(NAVIGATE);
  console.log("navigated:", JSON.stringify(nav));
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  console.log("level ready; settling 2s...");
  await page.waitForTimeout(2000);
  const dump = await page.evaluate(DUMP);
  writeFileSync(OUT, JSON.stringify(dump, null, 1));
  console.log("written:", OUT);
  console.log("pers1:", JSON.stringify(dump.pers1));
  console.log("pers2:", JSON.stringify(dump.pers2));
  console.log("door1:", JSON.stringify(dump.door1));
  console.log("door2:", JSON.stringify(dump.door2));
  console.log("objects:", dump.objects.length, "groundFixtures:", dump.groundFixtureCount, "totalDiamonds:", dump.totalDiamonds);
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

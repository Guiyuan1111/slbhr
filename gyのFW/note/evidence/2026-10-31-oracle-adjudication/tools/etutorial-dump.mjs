// etutorial-dump.mjs — oracle tutorial_fire 运行时权威数据倾倒（只读观测，不写 oracle）
// 产出: TEMP/fw-oe-1/et-dump.json
// 坐标约定：screen_x = -world_x*32, screen_y = -world_y*32（y 向下为正，与 Phaser/Tiled 一致）
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8874/gameIndex.html";
const OUTDIR = "/home/gy/桌面/dev/slbhr/TEMP/fw-oe-1";
const OUT = OUTDIR + "/et-dump.json";

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
  return { filename: levelData.filename, temple: temple.id, levelIndex: temple.levels.indexOf(levelData) };
})()`;

const DUMP = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var out = {};
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function sx(wx) { return r4(-wx * 32); }
  function sy(wy) { return r4(-wy * 32); }
  function bodyScreen(b) { var p = b.GetPosition(); return { x: sx(p.x), y: sy(p.y) }; }
  function velScreen(b) { var v = b.GetLinearVelocity(); return { vx: r4(-v.x * 32), vy: r4(-v.y * 32) }; }
  function fixtureShapes(body) {
    var arr = [];
    var xf = body.GetTransform();
    function l2w(v) { return { x: xf.p.x + xf.q.c * v.x - xf.q.s * v.y, y: xf.p.y + xf.q.s * v.x + xf.q.c * v.y }; }
    for (var f = body.GetFixtureList(); f; f = f.GetNext()) {
      var sh = f.GetShape();
      if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
        var vs = [];
        var n = sh.m_count || sh.m_vertices.length;
        for (var i = 0; i < n; i++) {
          var w = l2w(sh.m_vertices[i]);
          vs.push([sx(w.x), sy(w.y)]);
        }
        arr.push({ kind: 'poly', vs: vs, fric: r4(f.GetFriction()), sensor: !!f.IsSensor() });
      } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape || (sh.m_radius != null && sh.m_p != null && sh.m_vertices == null)) {
        var c2 = l2w(sh.m_p || new box2d.b2Vec2(0, 0));
        arr.push({ kind: 'circle', cx: sx(c2.x), cy: sy(c2.y), r: r4(sh.m_radius * 32) });
      } else if (typeof sh.GetRadius === 'function') {
        var c = l2w(sh.m_p || new box2d.b2Vec2(0, 0));
        arr.push({ kind: 'circle', cx: sx(c.x), cy: sy(c.y), r: r4(sh.GetRadius() * 32) });
      } else {
        var meta = { kind: 'other', st: String(sh.GetType()) };
        try { meta.ctor = sh.constructor && sh.constructor.name; } catch (e) {}
        try { meta.keys = Object.keys(sh).slice(0, 12); } catch (e) {}
        try { if (sh.m_vertices) meta.nv = sh.m_vertices.length; } catch (e) {}
        arr.push(meta);
      }
    }
    return arr;
  }
  // === chars ===
  ['pers1', 'pers2'].forEach(function (k) {
    var P = L[k];
    var rec = {
      k: k,
      id: P.id != null ? P.id : (P.data && P.data.char),
      char: P.data && P.data.char,
      sprite: { x: r4(P.sprite.x), y: r4(P.sprite.y) },
      body: bodyScreen(P.body.data),
      vel: velScreen(P.body.data),
      shapes: fixtureShapes(P.body.data),
      mass: r4(P.body.data.GetMass()),
      jumpVelocity: P.jumpVelocity, jumpImpulse: P.jumpImpulse, runForce: P.runForce,
      floatForce: P.floatForce, maxSpeed: P.maxSpeed, defaultMaxSpeed: P.defaultMaxSpeed,
      absoluteMaxSpeed: P.absoluteMaxSpeed, feetFriction: P.feetFriction,
      prohibitJump: !!P.prohibitJump,
      keysResolved: !!(P.cursors && P.cursors.up),
      diamonds: P.data ? P.data.diamonds : null,
    };
    out[k] = rec;
  });
  // === doors ===
  ['door1', 'door2'].forEach(function (k) {
    var D = L[k];
    if (!D) { out[k] = null; return; }
    var rec = { pos: D.pos ? JSON.parse(JSON.stringify(D.pos)) : null, sprite: { x: r4(D.sprite.x), y: r4(D.sprite.y) }, char: D.data && D.data.char, isOpen: !!D.isOpen, isUp: !!D.isUp };
    try { if (D.sensor && D.sensor.m_body) rec.sensor = { body: bodyScreen(D.sensor.m_body), shapes: fixtureShapes(D.sensor.m_body) }; } catch (e) { rec.sensorErr = String(e); }
    try { if (D.body && D.body.data) rec.body = bodyScreen(D.body.data); } catch (e) {}
    out[k] = rec;
  });
  // === objects ===
  out.objects = (L.objects || []).map(function (o, i) {
    var rec = { i: i, ctor: o.constructor && o.constructor.name || '?', otype: o.options && o.options.type, options: JSON.parse(JSON.stringify(o.options || {})) };
    try { if (o.body && o.body.data) { rec.body = bodyScreen(o.body.data); rec.shapes = fixtureShapes(o.body.data); rec.mass = r4(o.body.data.GetMass()); rec.bodyType = o.body.data.GetType(); } } catch (e) { rec.bodyErr = String(e); }
    try { if (o.sprite) rec.sprite = { x: r4(o.sprite.x), y: r4(o.sprite.y) }; } catch (e) {}
    try { if (o.data) rec.data = JSON.parse(JSON.stringify(o.data)); } catch (e) {}
    try { if (o.pos) rec.pos = JSON.parse(JSON.stringify(o.pos)); } catch (e) {}
    try {
      if (o.otype === undefined && o.options && o.options.type === 'pulley') {}
    } catch (e) {}
    // pulley sub-platforms (generic: any own key holding a box2d body)
    try {
      var subs = {};
      Object.keys(o).forEach(function (kk) {
        var v;
        try { v = o[kk]; } catch (e) { return; }
        if (!v) return;
        var b = null;
        if (typeof v.GetPosition === 'function') b = v;
        else if (v.body && typeof v.body.GetPosition === 'function') b = v.body;
        else if (v.data && typeof v.data.GetPosition === 'function') b = v.data;
        if (b) { var p = b.GetPosition(); subs[kk] = { x: sx(p.x), y: sy(p.y) }; }
      });
      if (Object.keys(subs).length) rec.subs = subs;
      if (o.state != null) rec.state = String(o.state);
    } catch (e) {}
    return rec;
  });
  // === ground body ===
  var gb = L.groundBody;
  var xf = gb.GetTransform();
  out.groundXf = { p: { x: r4(xf.p.x), y: r4(xf.p.y) }, c: r4(xf.q.c), s: r4(xf.q.s) };
  out.groundFixtures = fixtureShapes(gb);
  out.groundFixtureCount = out.groundFixtures.length;
  // === ALL world bodies (catch lava / anything not on groundBody) ===
  out.worldBodies = [];
  try {
    var b = g.physics.box2d.world.GetBodyList();
    var n = 0;
    while (b && n < 400) {
      n++;
      var ud = b.GetUserData();
      var isGround = (b === gb);
      var isChar = (L.pers1 && b === L.pers1.body.data) || (L.pers2 && b === L.pers2.body.data);
      if (!isGround && !isChar) {
        var rec = { type: b.GetType(), screen: bodyScreen(b), ud: ud == null ? null : String(ud).slice(0, 80) };
        try { rec.shapes = fixtureShapes(b); } catch (e) { rec.shErr = String(e); }
        out.worldBodies.push(rec);
      }
      b = b.GetNext();
    }
  } catch (e) { out.worldBodiesErr = String(e); }
  // === misc ===
  out.totalDiamonds = L.totalDiamonds;
  out.levelFilename = L.levelData && L.levelData.filename;
  out.useDust = L.useDust;
  out.tutorialTexts = (L.tutorialTexts || []).length;
  out.ended = !!L.ended;
  out.gravity = (function () { try { var gr = g.physics.box2d.world.GetGravity(); return { x: r4(gr.x * 32), y: r4(-gr.y * 32) }; } catch (e) { return String(e); } })();
  out.ptm = (function () { try { return g.physics.box2d.ptmRatio != null ? g.physics.box2d.ptmRatio : (g.physics.box2d.PTM_RATIO || null); } catch (e) { return null; } })();
  return out;
})()`;

async function main() {
  mkdirSync(OUTDIR, { recursive: true });
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
  // transform calibration: sprite vs body-derived screen coords
  for (const k of ["pers1", "pers2"]) {
    const P = dump[k];
    P.spriteVsBody = { dx: Math.round((P.sprite.x - P.body.x) * 100) / 100, dy: Math.round((P.sprite.y - P.body.y) * 100) / 100 };
  }
  writeFileSync(OUT, JSON.stringify(dump, null, 1));
  console.log("written:", OUT);
  for (const k of ["pers1", "pers2"]) {
    const P = dump[k];
    console.log(k, "char:", P.char, "sprite:", JSON.stringify(P.sprite), "bodyScreen:", JSON.stringify(P.body), "spriteVsBody:", JSON.stringify(P.spriteVsBody), "mass:", P.mass, "jumpV:", P.jumpVelocity, "maxSpeed:", P.maxSpeed, "keys:", P.keysResolved);
  }
  console.log("door1:", JSON.stringify(dump.door1 && { pos: dump.door1.pos, sprite: dump.door1.sprite, char: dump.door1.char }));
  console.log("door2:", JSON.stringify(dump.door2 && { pos: dump.door2.pos, sprite: dump.door2.sprite, char: dump.door2.char }));
  console.log("objects:", dump.objects.length, "groundFixtures:", dump.groundFixtureCount, "worldBodies(extra):", dump.worldBodies.length, "diamonds:", dump.totalDiamonds, "gravity(px/s^2 down):", JSON.stringify(dump.gravity));
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

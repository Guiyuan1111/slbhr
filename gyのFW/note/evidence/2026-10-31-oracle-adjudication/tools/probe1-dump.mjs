// probe1-dump.mjs — crystal_03 oracle 实机静态 dump（8871 只读）
// 产出: TEMP/fw-oc-8871/probe1-dump.json
//  1) 全设备（portal/lever/pusher/platform/box）options/state/body/fixture/joint
//  2) portal sensor+eventHorizon 世界→屏幕 AABB
//  3) 指定屏幕区域内 ground fixture 顶点（屏幕系，验证 col16 台阶/row-18/row-14 板等）
//  4) 门位置、出生点、重力、截图
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8871/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe1-dump.json";
const SHOT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871/probe1-shot.png";

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

// 屏幕系区域 [x0,x1,y0,y1]
const REGIONS = {
  R1_col16_base: [470, 590, 220, 330],
  R2_row18_west: [0, 240, 470, 660],
  R3_row18_east_lift: [630, 850, 430, 670],
  R4_row14_slab: [140, 420, 410, 640],
  R5_row9_structure: [140, 420, 250, 410],
  R6_P3_leftwall: [0, 90, 550, 730],
  R7_row6_row4_east: [590, 1265, 80, 250],
  R8_row19_east: [740, 1265, 550, 730],
  R9_doors: [0, 520, 220, 300],
  R10_bottom_stair: [560, 860, 750, 930],
  R11_spawn: [480, 720, 830, 930],
};

const DUMP = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var b2 = box2d;
  var REGIONS = ${JSON.stringify(REGIONS)};
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function w2s(p) { return { x: r4(-p.x * 32), y: r4(-p.y * 32) }; }
  function bodyInfo(bd) {
    var p = bd.GetPosition(), out = { world: { x: r4(p.x), y: r4(p.y) }, screen: w2s(p), angle: r4(bd.GetAngleRadians()), type: bd.GetType(), mass: r4(bd.GetMass()) };
    return out;
  }
  function fixtureInfo(f, bd) {
    var sh = f.GetShape(), info = { shape: sh.GetType(), isSensor: f.IsSensor(), userData: null, filter: { cat: f.GetFilterData().categoryBits, mask: f.GetFilterData().maskBits } };
    try { info.userData = JSON.stringify(f.m_userData); } catch (e) { info.userData = String(f.m_userData); }
    if (sh.GetType() === b2.b2ShapeType.e_polygonShape) {
      var n = (typeof sh.m_count === "number") ? sh.m_count : sh.GetVertexCount();
      var vs = [];
      for (var i = 0; i < n; i++) {
        var v = sh.m_vertices ? sh.m_vertices[i] : sh.GetVertex(i);
        var w = b2.b2MulXV(bd.GetTransform(), v, new b2.b2Vec2());
        vs.push(w2s(w));
      }
      info.vertsScreen = vs;
    } else if (sh.GetType() === b2.b2ShapeType.e_circleShape) {
      var p = b2.b2MulXV(bd.GetTransform(), sh.m_p, new b2.b2Vec2());
      info.centerScreen = w2s(p); info.radiusPx = r4(sh.m_radius * 32);
    }
    return info;
  }
  function fixturesOf(bd) {
    var out = [], f = bd.GetFixtureList();
    while (f) { out.push(fixtureInfo(f, bd)); f = f.GetNext(); }
    return out;
  }
  function inRegion(verts, reg) {
    for (var i = 0; i < verts.length; i++) {
      var v = verts[i];
      if (v.x >= reg[0] && v.x <= reg[1] && v.y >= reg[2] && v.y <= reg[3]) return true;
    }
    return false;
  }
  var out = { devices: [], groundRegions: {}, meta: {} };
  // gravity
  var grav = g.physics.box2d.world.GetGravity();
  out.meta.gravityWorld = { x: r4(grav.x), y: r4(grav.y) };
  out.meta.px2World = 'world = -screen/32 (empirical, portal-probe 01号档 §5.1)';
  // devices
  var objs = L.objects || [];
  out.devices = objs.map(function (d) {
    var o = { type: d.options && d.options.type, state: d.state, props: d.options && d.options.properties };
    try { o.posScreen = d.options ? { x: r4(d.options.x), y: r4(d.options.y) } : null; } catch (e) {}
    try { o.rotation = d.options ? r4(d.options.rotation) : null; } catch (e) {}
    if (d.body && d.body.data) { o.body = bodyInfo(d.body.data); o.fixtures = fixturesOf(d.body.data); }
    if (d.joint) {
      var j = d.joint;
      o.joint = { cls: j.constructor.name };
      try { o.joint.translation = r4(j.GetJointTranslation()); } catch (e) {}
      try { o.joint.angle = r4(j.GetJointAngleRadians()); } catch (e) {}
      try { o.joint.motorSpeed = r4(j.GetMotorSpeed()); } catch (e) {}
      try { o.joint.lower = r4(j.GetLowerLimit()); } catch (e) {}
      try { o.joint.upper = r4(j.GetUpperLimit()); } catch (e) {}
      try { o.joint.maxMotorForce = r4(j.GetMaxMotorForce ? j.GetMaxMotorForce() : j.m_maxMotorForce); } catch (e) {}
      try { o.joint.maxMotorTorque = r4(j.m_maxMotorTorque); } catch (e) {}
    }
    if (o.type === 'portal') {
      o.portalId = d.options.properties.portalId;
      o.inverted = !!d.options.properties.inverted;
    }
    if (o.type === 'lever') { o.onis = d.options.properties.onis; o.startPos = d.options.properties.startPos; }
    if (o.type === 'box') { o.spriteScreen = { x: r4(d.sprite && d.sprite.x), y: r4(d.sprite && d.sprite.y) }; }
    return o;
  });
  // connectPortals pairing (via other refs)
  out.portalPairs = objs.filter(function (d) { return d.options && d.options.type === 'portal'; }).map(function (p, i) {
    var idx = objs.indexOf(p.other);
    return { idx: i, portalId: p.options.properties.portalId, state: p.state, inverted: !!p.options.properties.inverted, centerScreen: w2s(p.body.data.GetPosition()), otherIdx: idx };
  });
  // doors
  out.doors = ['door1', 'door2'].map(function (k) {
    var d = L[k];
    if (!d) return null;
    return { k: k, char: d.data && d.data.char, pos: d.pos, isUp: !!d.isUp, isOpen: !!d.isOpen, bodyScreen: d.body && d.body.data ? w2s(d.body.data.GetPosition()) : null, fixtures: d.body && d.body.data ? fixturesOf(d.body.data) : null };
  });
  // chars
  out.chars = ['pers1', 'pers2'].map(function (k) {
    var c = L[k];
    return { k: k, char: c.data && c.data.char, body: bodyInfo(c.body.data), isDead: !!c.isDead };
  });
  // ground fixtures in regions
  var gb = L.groundBody;
  Object.keys(REGIONS).forEach(function (rk) {
    var reg = REGIONS[rk], hits = [];
    var f = gb.GetFixtureList();
    while (f) {
      var info = fixtureInfo(f, gb);
      if (info.vertsScreen && inRegion(info.vertsScreen, reg)) hits.push(info);
      f = f.GetNext();
    }
    out.groundRegions[rk] = { region: reg, fixtures: hits };
  });
  // all portal aabbs quick
  return out;
})()`;

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oc-8871", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("console", (m) => { const t = m.text(); if (t.includes("Object type") || t.includes("not found")) console.log("[console]", t); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  console.log("progress ready");
  const nav = await page.evaluate(NAVIGATE);
  console.log("navigated:", JSON.stringify(nav));
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(800);
  console.log("level ready");
  const dump = await page.evaluate(DUMP);
  writeFileSync(OUT, JSON.stringify(dump, null, 1));
  console.log("written:", OUT);
  console.log("devices:", dump.devices.map((d) => `${d.type}@${d.posScreen ? d.posScreen.x + "," + d.posScreen.y : "?"} state=${d.state}`).join(" | "));
  console.log("doors:", JSON.stringify(dump.doors && dump.doors.map((d) => d && { k: d.k, pos: d.pos, up: d.isUp })));
  console.log("gravity:", JSON.stringify(dump.meta.gravityWorld));
  await page.screenshot({ path: SHOT, fullPage: false });
  console.log("shot:", SHOT);
  await browser.close();
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

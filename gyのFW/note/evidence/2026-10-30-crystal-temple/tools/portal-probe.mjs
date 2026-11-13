// portal-probe.mjs v4 — crystal oracle 实机探针（8789 只读；引擎零改动）
// A. transport() 直接对拍：受控 entry（offset×velocity×side），测出口位置/速度公式（含 Δ=90° 旋转变体）
// B. 触发链旁路验证：自注册 eventHorizon/sensor 的 fixture 回调（直接写 __cap.raw，绕过被消音的 console），
//    fb 真实走步入 portal，观测 begin/end 与 nearBodies 侧
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8789/gameIndex.html";
const FIXED_DT = 1 / 60;
const FRAMES = 260;
const MAP_H = 29 * 32;
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/rd0/portal-probe-out.json";

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'crystal'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/crystal_04.json') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename };
})()`;

const INSTALL_HOOK = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  var portals = (L.objects || []).filter(function (d) { return d.options && d.options.type === 'portal'; });
  window.__cap = { frameIndex: 0, samples: [], tlogs: [], raw: [], done: false, realTransports: 0 };
  var cap = window.__cap;
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  var V = function (x, y) { return new box2d.b2Vec2(x, y); };
  var fb = L.pers1;

  // 真实 transport 打点（保留原逻辑）
  portals.forEach(function (p) {
    var orig = p.transport.bind(p);
    p.transport = function (a) {
      cap.realTransports++;
      var pre = { p: a.body.data.GetPosition().Clone(), v: a.body.data.GetLinearVelocity().Clone() };
      orig(a);
      var post = { p: a.body.data.GetPosition().Clone(), v: a.body.data.GetLinearVelocity().Clone() };
      cap.tlogs.push({
        f: cap.frameIndex, at: portals.indexOf(p), other: portals.indexOf(p.other),
        invA: !!p.options.properties.inverted, invB: !!p.other.options.properties.inverted,
        rotA: p.options.rotation, rotB: p.other.options.rotation,
        pre: { x: r4(pre.p.x), y: r4(pre.p.y), vx: r4(pre.v.x), vy: r4(pre.v.y) },
        post: { x: r4(post.p.x), y: r4(post.p.y), vx: r4(post.v.x), vy: r4(post.v.y) },
        mass: a.body.data.GetMass(),
      });
    };
  });

  // 自注册 contact 旁路（临时顶掉 id66 (=idx2) 的两个回调，直接记录）
  var p66 = portals[2];
  var mySensor = function (bodyA, bodyB, fixA, fixB, isBegin) {
    cap.raw.push({ f: cap.frameIndex, kind: 'sensor66', begin: !!isBegin, other: bodyB ? (bodyB.m_userData === 'pers' ? 'pers' : String(bodyB.m_userData)) : '?' });
  };
  var myHorizon = function (bodyA, bodyB, fixA, fixB, isBegin) {
    cap.raw.push({ f: cap.frameIndex, kind: 'horizon66', begin: !!isBegin, other: bodyB ? (bodyB.m_userData === 'pers' ? 'pers' : String(bodyB.m_userData)) : '?' });
  };
  window.__hook66 = function () {
    p66.body.setFixtureContactCallback(p66.sensorFixture, mySensor, p66);
    p66.body.setFixtureContactCallback(p66.eventHorizon, myHorizon, p66);
  };

  function sample() {
    var p1 = fb.body.data.GetPosition(), v1 = fb.body.data.GetLinearVelocity();
    cap.samples.push({ f: cap.frameIndex, paused: !!plugin.paused, dead: !!fb.isDead, fb: { x: r4(p1.x), y: r4(p1.y), vx: r4(v1.x), vy: r4(v1.y) } });
  }

  var phase = 'lab'; // lab -> walkin -> done
  plugin.update = function () {
    if (cap.done) { origUpdate.call(this); return; }
    if (cap.frameIndex === 20) window.__hook66();
    if (cap.frameIndex === 25 && phase === 'lab') {
      // transport 纯函数对拍（fb 归位出生平台，避免误死）
      try { cap.lab = window.__transportLab(); } catch (e) { cap.labErr = String(e); }
      phase = 'walkin';
    }
    if (cap.frameIndex === 30) { fb.body.data.SetPosition(V(705 / 32, (${MAP_H} - 432) / 32)); fb.body.data.SetLinearVelocity(V(0, 0)); }
    if (cap.frameIndex === 31) fb.body.data.SetLinearVelocity(V(10, 0));
    var dt = ${FIXED_DT}; this.game.time.elapsed = ${FIXED_DT} * 1e3;
    origUpdate.call(this);
    sample();
    cap.frameIndex++;
    if (phase === 'walkin' && cap.realTransports > 0 && cap.frameIndex > 45) cap.done = true;
    if (cap.frameIndex >= ${FRAMES}) cap.done = true;
  };

  // 直接对拍：在页内执行（walkin 结束后由 node 调 evaluate）
  window.__transportLab = function () {
    var out = [];
    var cases = [
      // [entryPortalIdx, otherIdx(自动), localDx, localDy, velx, vely, side, tempRotA, tempRotB]
      [2, -0.3, 0, 6, 0, 1, null, null],   // id66(inv false) → id65(inv true), rot 0/0
      [0, -0.3, 0, 8, 0, -1, null, null],  // id64(inv false) → id68(inv true)
      [3, +0.3, 0, 6, 0, 1, null, null],   // id67(inv false) → id69(inv false) 同 inverted（closed 状态不影响纯函数）
      [2, -0.3, 0, 0, -5, 1, null, null],  // 斜向速度
      [2, -0.3, 0, 2, 0, -1, null, null],  // 慢速 → 10/mass 地板
      [2, -0.3, 0, 0.5, 0, -1, null, null],// 极慢
      [0, -0.3, 0, 6, 0, 1, Math.PI / 2, 0],   // A 旋 90°、B 0
      [0, -0.3, 0, 6, 0, 1, 0, Math.PI / 2],   // A 0、B 旋 90°
      [0, -0.3, 0.4, 6, 3, 1, null, null],     // 带 y 偏移与 vy
    ];
    cases.forEach(function (c) {
      var idx = c[0], dx = c[1], dy = c[2], vx = c[3], vy = c[4], side = c[5], ra = c[6], rb = c[7];
      var p = portals[idx], q = p.other;
      var raO = p.options.rotation, rbO = q.options.rotation;
      if (ra !== null) p.options.rotation = ra;
      if (rb !== null) q.options.rotation = rb;
      var e = V(0, 1); e.SelfRotateRadians(p.options.rotation);
      var pos = p.body.data.GetPosition().Clone(); pos.SelfAdd(V(dx, dy));
      var fake = { body: fb.body, vel: V(vx, vy), side: side };
      fb.body.data.SetPosition(pos);
      fb.body.data.SetLinearVelocity(V(vx, vy));
      var rotChanged = (ra !== null || rb !== null);
      p.transport(fake);
      var post = fb.body.data.GetPosition().Clone(), vpost = fb.body.data.GetLinearVelocity().Clone();
      out.push({
        caseId: out.length, at: idx, other: portals.indexOf(q),
        invA: !!p.options.properties.inverted, invB: !!q.options.properties.inverted,
        rotA: p.options.rotation, rotB: q.options.rotation,
        entry: { lx: dx, ly: dy, vx: vx, vy: vy, side: side },
        entryWorld: { x: r4(pos.x), y: r4(pos.y) },
        A: { x: r4(p.body.data.GetPosition().x), y: r4(p.body.data.GetPosition().y) },
        B: { x: r4(q.body.data.GetPosition().x), y: r4(q.body.data.GetPosition().y) },
        exit: { x: r4(post.x), y: r4(post.y), vx: r4(vpost.x), vy: r4(vpost.y) },
        mass: fb.body.data.GetMass(),
        rotChanged: rotChanged,
      });
      if (rotChanged) { p.options.rotation = raO; q.options.rotation = rbO; }
    });
    // 归位出生平台（右下），避免误死
    fb.body.data.SetPosition(V(35.5, 1.0));
    fb.body.data.SetLinearVelocity(V(0, 0));
    return out;
  };
})();`;

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/rd0", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  console.log("progress ready");
  const nav = await page.evaluate(NAVIGATE);
  console.log("navigated:", JSON.stringify(nav));
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  console.log("level ready");
  await page.evaluate(INSTALL_HOOK);
  // walk-in（真实触发链）+ lab（f25 已先行执行）
  await page.waitForFunction(`(() => { try { return window.__cap && (window.__cap.done || window.__cap.frameIndex > 250); } catch { return false; } })()`, null, { timeout: 120000, polling: 100 });
  const walkin = await page.evaluate(`(function(){ var c = window.__cap; return { raw: c.raw, tlogs: c.tlogs, realTransports: c.realTransports, lab: c.lab, labErr: c.labErr, samples: c.samples.filter(function(s,i){ return s.f>=28 && s.f<=70; }) }; })()`);
  writeFileSync(OUT, JSON.stringify({ walkin }, null, 1));
  console.log("written:", OUT, "raw events:", walkin.raw.length, "realTransports:", walkin.realTransports, "lab cases:", (walkin.lab || []).length, walkin.labErr || "");
  await browser.close();
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

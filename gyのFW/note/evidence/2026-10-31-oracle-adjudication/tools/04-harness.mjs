// 04-harness.mjs — oracle tutorial_fire 帧步进输入探针（只读 oracle；页内驱动 isDown 标志）
// 用法: node 04-harness.mjs <case.json>
// case.json: { name, setup: [ {teleport:{who,x,yFeet}}, ... 可选 ], program: [ per-frame inputs ],
//              frames: N, who: 'fb'|'wg' }
// program 元素: null 或 {fb:{l,r,u}, wg:{l,r,u}} 或 {teleport:...}/{release:...} 逐帧覆盖
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8873/gameIndex.html";
const caseFile = process.argv[2];
if (!caseFile) { console.error("usage: node 04-harness.mjs <case.json>"); process.exit(1); }
const CASE = JSON.parse(readFileSync(caseFile, "utf8"));
const OUT = caseFile.replace(/\.json$/, ".out.json");

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
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

// 页内 harness：劫持 plugin.update 做帧计数 + 逐帧采样 + 逐帧输入程序
const INSTALL = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  var fb = L.pers1, wg = L.pers2;
  function keysOf(P) {
    var m = P.cursors || P.char || P;
    return { up: m.up, left: m.left, right: m.right, src: (m.up ? 'cursors' : 'none') };
  }
  window.__keys = { fb: keysOf(fb), wg: keysOf(wg) };
  var H = window.__h = {
    frames: 0, samples: [], prog: ${JSON.stringify(JSON.stringify(CASE.program || []))},
    total: ${CASE.frames || 600}, caseName: ${JSON.stringify(CASE.name)},
    events: [],
  };
  // 跳跃决策插桩：包装 pers.update，逐帧记录 jump 相关内部量
  if (${CASE.debugJump ? "true" : "false"}) {
    [fb, wg].forEach(function (P) {
      var orig = P.update;
      P.update = function () {
        var pre = {
          f: H.frames, up: !!P.cursors.up.isDown,
          prohibit: !!P.prohibitJump,
          nContacts: P.feetSensor ? P.feetSensor.contacts.length : -1,
        };
        if (P.feetSensor && P.feetSensor.contacts.length) {
          var j = P.cursors.left.isDown ? new box2d.b2Vec2(1, 0) : P.cursors.right.isDown ? new box2d.b2Vec2(-1, 0) : new box2d.b2Vec2(0, -1);
          var norms = P.feetSensor.contacts.map(function (c) {
            if (!c.m_normal) c.m_normal = new box2d.b2Vec2();
            c.m_fixtureA.m_body.GetWorldVector(c.m_manifold.localNormal, c.m_normal);
            return { ny: Math.round(c.m_normal.y * 1e3) / 1e3, nx: Math.round(c.m_normal.x * 1e3) / 1e3, ud: String(c.m_fixtureA.m_userData) };
          });
          norms.sort(function (a, b) { return (a.ny * j.y + a.nx * j.x) - (b.ny * j.y + b.nx * j.x); });
          pre.norms = norms;
          pre.j = [j.x, j.y];
        }
        var r = orig.apply(this, arguments);
        pre.vyAfter = Math.round(P.body.data.GetLinearVelocity().y * 32 * 10) / 10;
        H.events.push(pre);
        return r;
      };
    });
  }
  H.prog = JSON.parse(H.prog);
  function setKeys(k, spec) {
    if (!k.up) return;
    k.up.isDown = !!(spec && spec.u);
    k.left.isDown = !!(spec && spec.l);
    k.right.isDown = !!(spec && spec.r);
  }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function snapshot() {
    function rec(P) {
      var p = P.body.data.GetPosition(), v = P.body.data.GetLinearVelocity();
      return { x: r4(-p.x * 32), y: r4(-p.y * 32), vx: r4(v.x * 32), vy: r4(-v.y * 32), dead: !!P.isDead };
    }
    var s = { f: H.frames, fb: rec(fb), wg: rec(wg) };
    try {
      var objs = L.objects || [];
      var extra = {};
      objs.forEach(function (o, i) {
        if (o.options && o.options.type === 'platform' && o.body) {
          var p = o.body.data.GetPosition();
          extra['p' + i] = { x: r4(-p.x * 32), y: r4(-p.y * 32) };
        }
      });
      // pulley plates
      var pulley = objs.filter(function (o) { return o.options && o.options.type === 'pulley'; })[0];
      if (pulley) {
        ['platform1', 'platform2', 'plat1', 'plat2'].forEach(function (k) {
          var t = pulley[k];
          if (!t) return;
          var b = t.body || t.data || t;
          if (b && b.GetPosition) {
            var p = b.GetPosition();
            extra[k] = { x: r4(-p.x * 32), y: r4(-p.y * 32) };
          } else if (t.x != null && t.y != null) {
            extra[k] = { sx: r4(t.x), sy: r4(t.y) };
          }
        });
        if (pulley.state != null) extra.pulleyState = String(pulley.state);
      }
      // pushers + platforms state
      objs.forEach(function (o, i) {
        if (!o.options) return;
        if (o.options.type === 'pusher') {
          extra['b' + i] = { pressed: !!o.pressed, state: o.state == null ? null : String(o.state), down: o.isDown == null ? null : !!o.isDown };
        }
        if (o.options.type === 'platform') {
          extra['platDev' + i] = { state: o.state == null ? null : String(o.state) };
        }
        if ((o.options.type === 'box' || o.options.type === 'boxheavy') && o.body) {
          var bp = o.body.data.GetPosition();
          extra[o.options.type + '_' + i] = { x: r4(-bp.x * 32), y: r4(-bp.y * 32) };
        }
      });
      s.mech = extra;
      try { s.game = { state: g.state.current, ended: !!L.ended, d1open: !!(L.door1 && L.door1.isOpen), d1up: !!(L.door1 && L.door1.isUp), d2open: !!(L.door2 && L.door2.isOpen), d2up: !!(L.door2 && L.door2.isUp), paused: !!g.physics.box2d.paused }; } catch (e) { s.gameErr = String(e); }
    } catch (e) { s.mechErr = String(e); }
    return s;
  }
  plugin.update = function () {
    var h = window.__h;
    if (h.frames >= h.total) { return origUpdate.call(this); }
    var step = h.prog[h.frames];
    if (step) {
      if (step.fb) setKeys(window.__keys.fb, step.fb);
      if (step.wg) setKeys(window.__keys.wg, step.wg);
      if (step.teleport) {
        var P = step.teleport.who === 'wg' ? wg : fb;
        // yFeet = 期望脚底屏幕 y；中心 = feet - 35.5
        P.body.data.SetPosition(new box2d.b2Vec2(-step.teleport.x / 32, -(step.teleport.yFeet - 35.5) / 32));
        P.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
        h.events.push({ f: h.frames, tp: step.teleport });
      }
      if (step.tpObj != null) {
        // 传送 L.objects[idx] 的刚体（中心坐标 x,y，屏幕系）
        var OB = (L.objects || [])[step.tpObj];
        if (OB && OB.body && OB.body.data) {
          OB.body.data.SetPosition(new box2d.b2Vec2(-step.tpObjX / 32, -step.tpObjY / 32));
          OB.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
          h.events.push({ f: h.frames, tpObj: step.tpObj, x: step.tpObjX, y: step.tpObjY });
        }
      }
      if (step.stop) { g.physics.box2d.paused = true; h.events.push({ f: h.frames, stopped: true }); }
    }
    this.game.time.elapsed = 1000 / 60;
    origUpdate.call(this);
    if (!g.physics.box2d.paused) h.samples.push(snapshot()); else h.samples.push(snapshot());
    h.frames++;
  };
  return { installed: true, fbKeys: window.__keys.fb.src, wgKeys: window.__keys.wg.src };
})()`;

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oe-1", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  const info = await page.evaluate(INSTALL);
  console.log("harness:", JSON.stringify(info));
  await page.waitForFunction("window.__h && window.__h.frames >= window.__h.total", null, { timeout: 300000, polling: 200 });
  const data = await page.evaluate("(function(){ var h=window.__h; return { name: h.caseName, frames: h.frames, events: h.events, samples: h.samples, keys: { fb: !!window.__keys.fb.up, wg: !!window.__keys.wg.up } }; })()");
  writeFileSync(OUT, JSON.stringify(data));
  const s = data.samples;
  const last = s[s.length - 1];
  const minFeet = (who) => Math.min(...s.map((x) => x[who].y + 35.5));
  console.log("case:", data.name, "frames:", data.frames, "keysResolved:", JSON.stringify(data.keys));
  console.log("last fb:", JSON.stringify(last.fb), "wg:", JSON.stringify(last.wg));
  console.log("min feetY fb:", Math.round(minFeet("fb") * 10) / 10, "wg:", Math.round(minFeet("wg") * 10) / 10);
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

// f01-dump.mjs — oracle F 部 fairies-01 权威运行时 dump（只读观测）
// 产出: TEMP/fw-of-1/f01-dump.json（含自 level 物理解冻起每物理帧的 lever/p3 时间线）
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1/f01-dump.json";

const READY = `(() => {
  try {
    var g = Phaser.GAMES[0];
    if (!g || !g.progress || !g.progress.get) return false;
    var ts = g.progress.get('temples');
    return !!(ts && ts.length && ts[0].levels && ts[0].levels.length > 5);
  } catch (e) { return false; }
})()`;

// 早装拦截：box2d 插件可能晚于 boot 实例化，轮询就绪后用存取器截获 Level 对 plugin.update 的覆写
const INSTALL_EARLY = `(function () {
  var g = Phaser.GAMES[0];
  var h = window.__h = { t: 0, samples: [], installed: false };
  var timer = setInterval(function () {
    var plugin = g.physics && g.physics.box2d;
    if (!plugin || h.installed) return;
    clearInterval(timer);
    h.installed = true;
    h.real = plugin.update;
    h.cur = plugin.update;
    Object.defineProperty(plugin, 'update', {
      configurable: true,
      get: function () {
        return function () {
          var r = h.cur.apply(this, arguments);
          try {
            var L = g.level;
            if (L && L.loadCompleted && L.pers1 && !plugin.paused) {
              h.t++;
              if (h.t <= 300 || h.t % 30 === 0) {
                var s = { f: h.t };
                (L.objects || []).forEach(function (o, i) {
                  var t = o.options && o.options.type;
                  if (t === 'lever') {
                    s['lev' + i] = { st: o.state, deg: Math.round(o.joint.GetJointAngleRadians() * 180 / Math.PI * 100) / 100 };
                  } else if (t === 'platform') {
                    var p = o.body.data.GetPosition();
                    s['p' + i] = { y: Math.round(-p.y * 32 * 100) / 100, st: o.state, tr: Math.round(o.joint.GetJointTranslation() * 1000) / 1000 };
                  } else if (t === 'pusher') {
                    s['b' + i] = { st: o.state, tr: Math.round(o.joint.GetJointTranslation() * 1000) / 1000 };
                  } else if (t === 'fairycup') {
                    s['cup' + i] = { st: o.state, n: o.currentFairies.length };
                  }
                });
                h.samples.push(s);
              }
            }
          } catch (e) { h.err = String(e); }
          return r;
        };
      },
      set: function (v) { h.cur = v; },
    });
  }, 8);
  return 'deferred-install-armed';
})()`;

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

const READY_LEVEL = `(() => { try { var L = Phaser.GAMES[0].level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { return Phaser.GAMES[0].physics.box2d.paused === false; } catch { return false; } })()`;

const DUMP = `(function () {
  var g = Phaser.GAMES[0];
  var L = g.level;
  var out = {};
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  ['pers1', 'pers2'].forEach(function (k) {
    var P = L[k];
    var p = P.body.data.GetPosition(), v = P.body.data.GetLinearVelocity();
    out[k] = {
      screen: { x: r4(P.sprite.x), y: r4(P.sprite.y) },
      bodyComputed: { x: r4(-p.x * 32), y: r4(-p.y * 32) },
      vel: { x: r4(v.x * 32), y: r4(-v.y * 32) },
      jumpVelocity: P.jumpVelocity, jumpIceVelocity: P.jumpIceVelocity,
      runForce: P.runForce, floatForce: P.floatForce,
      maxSpeed: P.maxSpeed, defaultMaxSpeed: P.defaultMaxSpeed, absoluteMaxSpeed: P.absoluteMaxSpeed,
      dead: !!P.isDead, mass: r4(P.body.data.GetMass()),
    };
  });
  out.fairies = (L.fairies || []).map(function (f) {
    var p = f.body.data.GetPosition();
    return { group: f.group, locked: !!f.locked, sprite: { x: r4(f.sprite.x), y: r4(f.sprite.y) }, ballComputed: { x: r4(-p.x * 32), y: r4(-p.y * 32) }, dragging: !!f.dragging };
  });
  out.doors = L.door1 && { d1: { x: r4(L.door1.sprite.x), y: r4(L.door1.sprite.y), char: L.door1.data.char, isUp: !!L.door1.isUp }, d2: { x: r4(L.door2.sprite.x), y: r4(L.door2.sprite.y), char: L.door2.data.char, isUp: !!L.door2.isUp } };
  out.objects = (L.objects || []).map(function (o, i) {
    var rec = { i: i, type: o.options && o.options.type, opts: { x: o.options.x, y: o.options.y, w: Math.round(o.options.width / 32 * 100) / 100, h: Math.round(o.options.height / 32 * 100) / 100, props: o.options.properties, rot: o.options.rotation } };
    try { if (o.sprite) rec.sprite = { x: r4(o.sprite.x), y: r4(o.sprite.y) }; } catch (e) {}
    try {
      if (o.body && o.body.data) {
        var p = o.body.data.GetPosition();
        rec.body = { x: r4(-p.x * 32), y: r4(-p.y * 32), angleDeg: Math.round(o.body.data.GetAngle() * 180 / Math.PI * 100) / 100 };
      }
    } catch (e) {}
    try {
      if (o.options.type === 'lever') {
        rec.lever = { state: o.state, jointDeg: Math.round(o.joint.GetJointAngleRadians() * 180 / Math.PI * 100) / 100, lower: o.joint.GetLowerLimit() * 180 / Math.PI, upper: o.joint.GetUpperLimit() * 180 / Math.PI, motorSpeed: o.joint.GetMotorSpeed(), onis: o.options.properties.onis, startPos: o.options.properties.startPos };
      }
      if (o.options.type === 'platform') {
        rec.plat = { state: o.state, tr: r4(o.joint.GetJointTranslation()), lower: r4(o.joint.m_lowerTranslation), upper: r4(o.joint.m_upperTranslation), motorSpeed: r4(o.joint.GetMotorSpeed()), dx: o.options.properties.dx, dy: o.options.properties.dy };
      }
      if (o.options.type === 'pusher') {
        rec.pusher = { state: o.state, tr: r4(o.joint.GetJointTranslation()), group: o.options.properties.group };
      }
      if (o.options.type === 'fairycup') {
        rec.cup = { state: o.state, group: o.options.properties.group, colorIdx: o.getColorIndex(), occupied: o.currentFairies.length, cupOff: { x: r4(o.mpx(o.cupOffset.x)), y: r4(o.mpx(o.cupOffset.y)) } };
      }
    } catch (e) { rec.devErr = String(e); }
    return rec;
  });
  out.levelFilename = L.levelData && L.levelData.filename;
  out.totalDiamonds = L.totalDiamonds;
  out.respawn = !!L.respawnManager;
  out.ended = !!L.ended;
  out.gravityY = g.physics.box2d.gravity ? r4(g.physics.box2d.gravity.y) : null;
  return out;
})()`;

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => { const s = String(e); if (!s.includes("4399")) console.log("[pageerror]", s.slice(0, 200)); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY, null, { timeout: 90000, polling: 250 });
  console.log("progress ready");
  await page.evaluate(INSTALL_EARLY);
  const nav = await page.evaluate(NAVIGATE);
  console.log("navigated:", nav);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 50 });
  console.log("level ready; settling 6s...");
  await page.waitForTimeout(6000);
  const dump = await page.evaluate(DUMP);
  const timeline = await page.evaluate("({ t: window.__h.t, err: window.__h.err, samples: window.__h.samples })");
  writeFileSync(OUT, JSON.stringify({ dump, timeline }, null, 1));
  console.log("written:", OUT);
  console.log("pers1:", JSON.stringify(dump.pers1));
  console.log("pers2:", JSON.stringify(dump.pers2));
  console.log("fairies:", JSON.stringify(dump.fairies));
  console.log("doors:", JSON.stringify(dump.doors));
  for (const o of dump.objects) {
    console.log(`obj[${o.i}] ${o.type}`, JSON.stringify(o.opts), o.lever ? `LEVER ${JSON.stringify(o.lever)}` : "", o.plat ? `PLAT ${JSON.stringify(o.plat)}` : "", o.pusher ? `PUSH ${JSON.stringify(o.pusher)}` : "", o.cup ? `CUP ${JSON.stringify(o.cup)}` : "", o.body ? `body=${JSON.stringify(o.body)}` : "");
  }
  console.log("physFrames:", timeline.t, "timeline err:", timeline.err, "samples:", timeline.samples.length);
  const tail = timeline.samples.slice(0, 12);
  tail.forEach((s) => console.log("  early", JSON.stringify(s)));
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

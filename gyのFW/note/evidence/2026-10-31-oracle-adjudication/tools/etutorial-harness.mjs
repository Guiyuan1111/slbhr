// etutorial-harness.mjs — oracle tutorial_fire 帧步进输入探针（fw-oracle-etutorial 槽；只读 oracle，页内驱动 isDown 标志）
// 用法: node etutorial-harness.mjs <case.json>
// case.json: { name, frames, program: { "<帧号>": spec, ... } }
//   spec: { fb:{l,r,u}, wg:{l,r,u}, teleport:{who,x,yFeet}, tpObj:{idx,x,y}, stop:true }（缺省帧保持先前键态）
// 坐标约定：screen px；yFeet=脚底物理 y（center+35.2）；teleport 设置 body 中心 (x, yFeet-35.2)
// 产出: <case>.out.json（与 case 同目录）
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8874/gameIndex.html";
const caseFile = process.argv[2];
if (!caseFile) { console.error("usage: node etutorial-harness.mjs <case.json>"); process.exit(1); }
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
    frames: 0, samples: [], prog: JSON.parse(${JSON.stringify(JSON.stringify(CASE.program || {}))}),
    total: ${CASE.frames || 600}, caseName: ${JSON.stringify(CASE.name)}, events: [],
  };
  // 机关对象索引（按 options.type + options.x 定位）
  var IDX = window.__idx = {};
  (L.objects || []).forEach(function (o) {
    var t = o.options && o.options.type, x = o.options && o.options.x;
    if (t === 'platform') IDX[t + '@' + x] = o;
    else if (t === 'pusher') IDX[t + '@' + x] = o;
    else if (t === 'box' || t === 'boxheavy') IDX[t] = o;
    else if (t === 'pulley') IDX.pulley = o;
  });
  // 滑轮盘（ud=reactable 的动态体）
  var plates = [];
  (function scan() {
    var b = plugin.world.GetBodyList(), n = 0;
    while (b && n < 400) {
      n++;
      var ud = b.GetUserData();
      if (ud === 'reactable') plates.push(b);
      b = b.GetNext();
    }
  })();
  function setKeys(k, spec) {
    if (!k.up) return;
    k.up.isDown = !!(spec && spec.u);
    k.left.isDown = !!(spec && spec.l);
    k.right.isDown = !!(spec && spec.r);
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function rec(P) {
    var p = P.body.data.GetPosition(), v = P.body.data.GetLinearVelocity();
    return [r2(-p.x * 32), r2(-p.y * 32), r2(-v.x * 32), r2(-v.y * 32), P.isDead ? 1 : 0];
  }
  function snapshot() {
    var s = { f: H.frames, fb: rec(fb), wg: rec(wg) };
    try {
      var m = [];
      var p0 = IDX['platform@1040'], p1 = IDX['platform@464'];
      if (p0 && p0.body) { var pp = p0.body.data.GetPosition(); m.push(['p0', r2(-pp.x * 32), r2(-pp.y * 32)]); }
      if (p1 && p1.body) { var q = p1.body.data.GetPosition(); m.push(['p1', r2(-q.x * 32), r2(-q.y * 32)]); }
      var b0 = IDX['pusher@752'], b1 = IDX['pusher@240'];
      if (b0) m.push(['b0s', Number(b0.state)]);
      if (b1) m.push(['b1s', Number(b1.state)]);
      if (IDX.box && IDX.box.body) { var bx = IDX.box.body.data.GetPosition(); m.push(['x0', r2(-bx.x * 32), r2(-bx.y * 32)]); }
      if (IDX.boxheavy && IDX.boxheavy.body) { var bh = IDX.boxheavy.body.data.GetPosition(); m.push(['x1', r2(-bh.x * 32), r2(-bh.y * 32)]); }
      plates.forEach(function (pl, i) { var p = pl.GetPosition(); m.push(['plate' + i, r2(-p.x * 32), r2(-p.y * 32)]); });
      s.m = m;
      s.g = { st: g.state.current, ended: !!L.ended, d1o: !!(L.door1 && L.door1.isOpen), d1u: !!(L.door1 && L.door1.isUp), d2o: !!(L.door2 && L.door2.isOpen), d2u: !!(L.door2 && L.door2.isUp), paused: !!plugin.paused };
    } catch (e) { s.err = String(e); }
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
        P.body.data.SetPosition(new box2d.b2Vec2(-step.teleport.x / 32, -(step.teleport.yFeet - 35.2) / 32));
        P.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
        if (P.body.data.SetAwake) P.body.data.SetAwake(true); // 该移植 SetPosition 不唤醒入睡体，必须显式唤醒
        h.events.push({ f: h.frames, tp: step.teleport });
      }
      if (step.tpObj != null) {
        var OB = (L.objects || [])[step.tpObj];
        if (OB && OB.body && OB.body.data) {
          OB.body.data.SetPosition(new box2d.b2Vec2(-step.tpObjX / 32, -step.tpObjY / 32));
          OB.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
          if (OB.body.data.SetAwake) OB.body.data.SetAwake(true);
          h.events.push({ f: h.frames, tpObj: step.tpObj, x: step.tpObjX, y: step.tpObjY });
        }
      }
      if (step.stop) { g.physics.box2d.paused = true; h.events.push({ f: h.frames, stopped: true }); }
    }
    this.game.time.elapsed = 1000 / 60;
    origUpdate.call(this);
    h.samples.push(snapshot());
    h.frames++;
  };
  return { installed: true, fbKeys: window.__keys.fb.src, wgKeys: window.__keys.wg.src, plates: plates.length };
})()`;

async function main() {
  mkdirSync("/home/gy/桌面/dev/slbhr/TEMP/fw-oe-1", { recursive: true });
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
  await page.waitForTimeout(1500);
  const info = await page.evaluate(INSTALL);
  console.log("harness:", JSON.stringify(info));
  await page.waitForFunction("window.__h && window.__h.frames >= window.__h.total", null, { timeout: 600000, polling: 200 });
  const data = await page.evaluate("(function(){ var h=window.__h; return { name: h.caseName, frames: h.frames, events: h.events, samples: h.samples }; })()");
  writeFileSync(OUT, JSON.stringify(data));
  const s = data.samples;
  const minFeet = (who) => Math.min(...s.map((x) => x[who][1] + 35.2));
  const last = s[s.length - 1];
  console.log("case:", data.name, "frames:", data.frames, "events:", JSON.stringify(data.events));
  console.log("last fb:", JSON.stringify(last.fb), "wg:", JSON.stringify(last.wg));
  console.log("min feetY fb:", Math.round(minFeet("fb") * 10) / 10, "wg:", Math.round(minFeet("wg") * 10) / 10);
  console.log("last g:", JSON.stringify(last.g));
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

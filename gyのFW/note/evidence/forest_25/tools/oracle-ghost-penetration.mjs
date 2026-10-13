// oracle 对拍：forest_25 p0 竖闸 vs r24 实心板带 —— 原版平台是否穿透地形（二元判别）
// 8787 只读伺服；传送 fb 踩 b0 按钮走真实信号链；观察 p0 终位。
// 碰撞模型预期：p0 卡死中心 y848（闸顶 y800 即板带底，起步即顶死）
// 穿透模型预期：p0 升 96px 至中心 y752，板体 y704-800 与板带 y768-800 实体重叠
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "TEMP/main-oracle";
mkdirSync(OUT, { recursive: true });

const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

const log = (...a) => console.log("[dump25]", ...a);

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  log("progress ready");

  const filename = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    return temple.levels.find(function (l) { return l.filename.indexOf('/forest_25.json') >= 0; }).filename;
  });
  await page.evaluate((fn) => {
    var g = require('Phaser').GAMES[0];
    var Level = require('States/Level/Level');
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    var levelData = temple.levels.find(function (l) { return l.filename === fn; });
    g.currentTemple = temple;
    g.state.add('level', Level);
    g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  }, filename);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  log("level ready:", filename);

  // ---- ① 机关/静态体构造 dump ----
  const dump = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level, w = g.physics.box2d.world;
    var DEV = {};
    ['Ball','Beamer','Box','BoxHeavy','BoxMirror','Diamond','Door','Hanging','InfiniteMirror','Lever','LightPusher','Liquid','MovingPlatform','Portal','Pulley','Pusher','Roman','RotMirror','Slider','Snow','TimedPusher','Wind','Window']
      .forEach(function (n) { try { DEV[n] = require('States/Level/Devices/' + n); } catch (e) {} });
    function clsOf(d) { for (var n in DEV) if (DEV[n] && d instanceof DEV[n]) return n; return 'Device'; }
    function fixInfo(bd) {
      var out = [], f = bd.GetFixtureList();
      while (f) {
        var fd = f.GetFilterData ? f.GetFilterData() : { categoryBits: -1, maskBits: -1, groupIndex: -1 };
        out.push({ cat: fd.categoryBits, mask: fd.maskBits, grp: fd.groupIndex, sensor: !!(f.IsSensor && f.IsSensor()), density: f.GetDensity ? f.GetDensity() : null, friction: f.GetFriction ? f.GetFriction() : null });
        f = f.GetNext();
      }
      return out;
    }
    var typeNum = { 0: 'static', 1: 'kinematic', 2: 'dynamic' };
    var devices = (L.objects || []).map(function (d, i) {
      var c = clsOf(d);
      var bd = null;
      try {
        if (c === 'Lever') bd = d.body ? d.body.data : null;
        else if (c === 'Pusher') bd = d.button && d.button.body ? d.button.body.data : null;
        else if (c === 'Pulley') bd = d.platform1 && d.platform1.body ? d.platform1.body.data : null;
        else if (c === 'Hanging') bd = d.platform && d.platform.body ? d.platform.body.data : null;
        else if (c === 'Roman') bd = d.joint && d.joint.GetBodyA ? d.joint.GetBodyA() : null;
        else if (d.sprite && d.sprite.body) bd = d.sprite.body.data;
        else if (d.body) bd = d.body.data;
      } catch (e) {}
      return {
        idx: i, cls: c, type: d.options ? d.options.type : null, gid: d.options ? d.options.gid : null,
        options: d.options ? { dx: d.options.dx, dy: d.options.dy, group: d.options.group, dtheta: d.options.dtheta, offsetY: d.options.offsetY } : null,
        body: bd ? { btype: typeNum[bd.GetType ? bd.GetType() : -1], mass: bd.GetMass ? bd.GetMass() : null, pos: bd.GetPosition ? { x: bd.GetPosition().x, y: bd.GetPosition().y } : null, fixtures: fixInfo(bd) } : null,
        sprite: d.sprite ? { x: d.sprite.x, y: d.sprite.y } : null,
      };
    });
    var ground = null, b = w.GetBodyList();
    while (b) { if (b.GetUserData && b.GetUserData() === 'ground') { ground = b; break; } b = b.GetNext(); }
    var ptm = g.physics.box2d.ptmRatio;
    return { ptm, gravityY: g.physics.box2d.gravity.y, devices, ground: ground ? { btype: 'static', mass: ground.GetMass(), pos: { x: ground.GetPosition().x, y: ground.GetPosition().y }, fixturesFirst5: fixInfo(ground).slice(0, 5), fixtureCount: fixInfo(ground).length } : null };
  });
  log("devices:", JSON.stringify(dump.devices.filter(d => d.cls !== 'Diamond' && d.cls !== 'Door'), null, 1).slice(0, 4000));

  // ---- ② 传送 fb 踩 b0 ----
  const tele = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var DEV = { Pusher: require('States/Level/Devices/Pusher') };
    var pusher = null;
    (L.objects || []).forEach(function (d) { if (d instanceof DEV.Pusher) pusher = d; });
    if (!pusher) return { ok: false, err: 'no pusher' };
    var btn = pusher.button.body.data;
    var bp = btn.GetPosition();
    var fb = L.pers1.body.data;
    var V = bp.constructor;
    var target = { x: bp.x, y: bp.y + 0.9 };
    var how = '';
    function readbackOk() { var p = fb.GetPosition(); return Math.abs(p.x - target.x) < 0.05 && Math.abs(p.y - target.y) < 0.05; }
    try { fb.SetTransform(new V(target.x, target.y), 0); how = 'ST(vec,ang)'; } catch (e0) {
      try { fb.SetPosition(new V(target.x, target.y)); how = 'SetPosition'; } catch (e1) {
        try {
          var T = fb.GetTransform ? fb.GetTransform() : null;
          if (!T) throw new Error('no GetTransform');
          if (T.position) { T.position.x = target.x; T.position.y = target.y; } else if (T.p) { T.p.x = target.x; T.p.y = target.y; }
          fb.SetTransform(T); how = 'mutate-T';
        } catch (e2) {
          try { fb.SetTransformAndState(new V(target.x, target.y), 0); how = 'STAS'; } catch (e3) {
            return { ok: false, err: [String(e0), String(e1), String(e2), String(e3)].join(' | ') };
          }
        }
      }
    }
    try { fb.SetLinearVelocity(new V(0, 0)); } catch (e) { try { fb.SetLinearVelocity({ x: 0, y: 0 }); } catch (e2) {} }
    if (!readbackOk()) {
      try { fb.SetPosition(new V(target.x, target.y)); how += '+SP'; } catch (e) {}
      try { fb.SetTransformAndState(new V(target.x, target.y), 0); how += '+STAS'; } catch (e) {}
    }
    var rb = fb.GetPosition();
    return { ok: Math.abs(rb.x - target.x) < 0.05 && Math.abs(rb.y - target.y) < 0.05, how: how, btnPos: { x: bp.x, y: bp.y }, fbPos: { x: rb.x, y: rb.y } };
  });
  log("teleport:", JSON.stringify(tele));
  if (!tele.ok) { console.error("teleport failed"); await browser.close(); process.exit(1); }

  // ---- ③ 轮询 p0（MovingPlatform dx:0 dy:3）与 fb，15s ----
  const pick = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var MP = require('States/Level/Devices/MovingPlatform');
    var p0 = null;
    (L.objects || []).forEach(function (d) {
      if (!(d instanceof MP)) return;
      var bd = d.sprite && d.sprite.body ? d.sprite.body.data : (d.body ? d.body.data : null);
      if (!bd) return;
      var p = bd.GetPosition();
      if (Math.abs(p.x + 33.5) < 0.3 && Math.abs(p.y + 26.5) < 0.3) p0 = d;
    });
    if (!p0) { (L.objects || []).forEach(function (d) { if (!p0 && d instanceof MP) p0 = d; }); }
    if (!p0) return null;
    var b = p0.sprite && p0.sprite.body ? p0.sprite.body.data : (p0.body ? p0.body.data : null);
    return { hasSprite: !!p0.sprite, sprite0: p0.sprite ? { x: p0.sprite.x, y: p0.sprite.y } : null, body0: b ? { x: b.GetPosition().x, y: b.GetPosition().y } : null };
  });
  log("p0 pick:", JSON.stringify(pick));
  if (!pick) { console.error("p0 not found"); await browser.close(); process.exit(1); }

  const tl = [];
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const s = await page.evaluate(() => {
      var g = require('Phaser').GAMES[0], L = g.level;
      var MP = require('States/Level/Devices/MovingPlatform');
      var p0 = null;
      (L.objects || []).forEach(function (d) {
        if (!(d instanceof MP)) return;
        var bd = d.sprite && d.sprite.body ? d.sprite.body.data : (d.body ? d.body.data : null);
        if (!bd) return;
        var p = bd.GetPosition();
        if (Math.abs(p.x + 33.5) < 0.3 && Math.abs(p.y + 26.5) < 0.3) p0 = d;
      });
      if (!p0) { (L.objects || []).forEach(function (d) { if (!p0 && d instanceof MP) p0 = d; }); }
      var b = p0.sprite && p0.sprite.body ? p0.sprite.body.data : (p0.body ? p0.body.data : null);
      var fb = L.pers1.body.data, wg = L.pers2.body.data;
      var btn = null;
      var PU = require('States/Level/Devices/Pusher');
      (L.objects || []).forEach(function (d) { if (d instanceof PU) btn = d.button.body.data; });
      return {
        t: Math.round(performance.now()),
        p0sprite: p0.sprite ? { x: Math.round(p0.sprite.x * 10) / 10, y: Math.round(p0.sprite.y * 10) / 10 } : null,
        p0body: b ? { x: Math.round(b.GetPosition().x * 1e4) / 1e4, y: Math.round(b.GetPosition().y * 1e4) / 1e4 } : null,
        fb: { x: Math.round(fb.GetPosition().x * 1e4) / 1e4, y: Math.round(fb.GetPosition().y * 1e4) / 1e4 },
        btnY: btn ? Math.round(btn.GetPosition().y * 1e4) / 1e4 : null,
        fbDead: !!(L.pers1 && L.pers1.dead), wgDead: !!(L.pers2 && L.pers2.dead),
      };
    });
    tl.push(s);
    if (i % 8 === 0) log(`t${i}`, JSON.stringify(s));
    // 稳定判据：连续 8 次位移 < 0.1px
    if (tl.length >= 10) {
      const last8 = tl.slice(-8);
      const ys = last8.map(x => x.p0sprite ? x.p0sprite.y : null);
      if (ys.every(y => y !== null && Math.abs(y - ys[0]) < 0.1) && Math.abs(ys[0] - (tl[0].p0sprite ? tl[0].p0sprite.y : 0)) > 0.5) { log("stabilized early"); break; }
      if (ys.every(y => y !== null && Math.abs(y - ys[0]) < 0.1) && i > 24) { log("no movement plateau"); break; }
    }
  }
  await page.screenshot({ path: `${OUT}/f25-p0-final.png` });
  log("timeline len:", tl.length);
  console.log(JSON.stringify({ dump, tele, pick, timeline: tl }, null, 1));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });

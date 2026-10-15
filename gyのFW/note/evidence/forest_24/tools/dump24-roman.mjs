// oracle 对拍：forest_24 Roman 杆/箱/角色 质量参数静态 dump（r24b 三疑似分歧点定谳用）
// 8787 只读；零输入，仅加载关卡后内省。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "TEMP/main-oracle";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[d24]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const filename = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var t = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    return t.levels.find(function (l) { return l.filename.indexOf('/forest_24.json') >= 0; }).filename;
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
  await new Promise(r => setTimeout(r, 3000)); // 静置 3s 稳定（杆落静息角）

  const dump = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var DEV = {};
    ['Ball','Beamer','Box','BoxHeavy','BoxMirror','Diamond','Door','Hanging','InfiniteMirror','Lever','LightPusher','Liquid','MovingPlatform','Portal','Pulley','Pusher','Roman','RotMirror','Slider','Snow','TimedPusher','Wind','Window']
      .forEach(function (n) { try { DEV[n] = require('States/Level/Devices/' + n); } catch (e) {} });
    function clsOf(d) { for (var n in DEV) if (DEV[n] && d instanceof DEV[n]) return n; return 'Device'; }
    function r4(v) { return Math.round(v * 1e4) / 1e4; }
    function fixtures(bd) {
      var out = [], f = bd.GetFixtureList();
      while (f) {
        var fd = f.GetFilterData();
        var sh = f.GetShape();
        out.push({
          shape: sh && sh.GetType ? sh.GetType() : null,
          cat: fd.categoryBits, mask: fd.maskBits, grp: fd.groupIndex,
          sensor: !!(f.IsSensor && f.IsSensor()),
          density: f.GetDensity ? r4(f.GetDensity()) : null,
          friction: f.GetFriction ? r4(f.GetFriction()) : null,
          restitution: f.GetRestitution ? r4(f.GetRestitution()) : null,
        });
        f = f.GetNext();
      }
      return out;
    }
    function bodyInfo(bd) {
      if (!bd) return null;
      var p = bd.GetPosition();
      return {
        type: ['static', 'kinematic', 'dynamic'][(bd.GetType && bd.GetType()) || 0],
        pos: { x: r4(p.x), y: r4(p.y) },
        angleDeg: bd.GetAngle != null ? r4(bd.GetAngle() * 180 / Math.PI) : null,
        mass: bd.GetMass ? r4(bd.GetMass()) : null,
        inertia: bd.GetInertia ? r4(bd.GetInertia()) : null,
        fixtures: fixtures(bd),
      };
    }
    function jointInfo(j) {
      if (!j) return null;
      var o = { type: j.GetType ? j.GetType() : null };
      try {
        o.bodyA = bodyInfo(j.GetBodyA()); o.bodyB = bodyInfo(j.GetBodyB());
        var aA = j.GetAnchorA(), aB = j.GetAnchorB();
        o.anchorA = { x: r4(aA.x), y: r4(aA.y) }; o.anchorB = { x: r4(aB.x), y: r4(aB.y) };
        if (j.GetJointAngle) { o.jointAngleDeg = r4(j.GetJointAngle() * 180 / Math.PI); o.jointSpeed = r4(j.GetJointSpeed()); }
        if (j.IsLimitEnabled) { o.limitEnabled = j.IsLimitEnabled(); o.lowerDeg = j.GetLowerAngle ? r4(j.GetLowerAngle() * 180 / Math.PI) : null; o.upperDeg = j.GetUpperAngle ? r4(j.GetUpperAngle() * 180 / Math.PI) : null; }
        if (j.IsMotorEnabled) { o.motorEnabled = j.IsMotorEnabled(); o.motorSpeed = j.GetMotorSpeed ? r4(j.GetMotorSpeed()) : null; o.maxMotorTorque = j.GetMaxMotorTorque ? r4(j.GetMaxMotorTorque()) : null; }
      } catch (e) { o.err = String(e); }
      return o;
    }
    var romans = [], boxes = [], others = [];
    (L.objects || []).forEach(function (d, i) {
      var c = clsOf(d);
      if (c === 'Roman') {
        romans.push({ idx: i, options: d.options ? JSON.parse(JSON.stringify(d.options)) : null, joint: jointInfo(d.joint) });
      } else if (c === 'Box' || c === 'BoxHeavy' || c === 'BoxMirror') {
        var bd = d.sprite && d.sprite.body ? d.sprite.body.data : (d.body ? d.body.data : null);
        boxes.push({ idx: i, cls: c, options: d.options ? { gid: d.options.gid, mass: d.options.mass, friction: d.options.friction } : null, body: bodyInfo(bd) });
      } else if (c === 'Lever' || c === 'Pusher') {
        others.push({ idx: i, cls: c, body: bodyInfo(d.body ? d.body.data : null) });
      }
    });
    var chars = { fb: bodyInfo(L.pers1.body.data), wg: bodyInfo(L.pers2.body.data) };
    return { romans: romans, boxes: boxes, chars: chars, others: others, ptm: g.physics.box2d.ptmRatio, gravityY: g.physics.box2d.gravity.y };
  });
  console.log(JSON.stringify(dump, null, 1));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });

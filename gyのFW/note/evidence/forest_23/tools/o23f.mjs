// r23b o23f：wg 键入诊断——d/A 按下后 cursors.right.isDown?
import { chromium } from "playwright";

const log = (...a) => console.log("[o23f]", ...a);
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.addInitScript(`
    window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40, a: 65, w: 87, d: 68, s: 83 };
    window.__dispatchKey = function (type, code) {
      var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
      Object.defineProperty(ev, 'which', { get: function () { return code; } });
      document.dispatchEvent(ev);
    };
  `);
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && g.progress.attributes.temples.length > 0); } catch { return false; } }, null, { timeout: 90000, polling: 250 });
  await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var Level = require('States/Level/Level');
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_23.json') >= 0; });
    g.currentTemple = temple;
    g.state.add('level', Level);
    g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  });
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } }, null, { timeout: 30000, polling: 100 });
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  log("ready");

  const read = () => page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var cur = function (p) { var c = p.cursors || {}; return { id: p.id || p.char, leftDown: !!(c.left && c.left.isDown), rightDown: !!(c.right && c.right.isDown), upDown: !!(c.up && c.up.isDown) }; };
    var px = function (b) { var p = b.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 }; };
    return { fb: { c: cur(L.pers1), p: px(L.pers1.body.data) }, wg: { c: cur(L.pers2), p: px(L.pers2.body.data) } };
  });

  let s = await read();
  log("基线", JSON.stringify(s));
  // 1) page.keyboard 真实按键 'd'
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  s = await read();
  log("按'd'(page.keyboard) 400ms后", JSON.stringify(s));
  await page.keyboard.up('d');
  // 2) 合成事件 keyCode 68
  await page.evaluate(() => window.__dispatchKey('keydown', 68));
  await page.waitForTimeout(400);
  s = await read();
  log("dispatchKey 68 400ms后", JSON.stringify(s));
  await page.evaluate(() => window.__dispatchKey('keyup', 68));
  // 3) fb 对照：ArrowRight
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  s = await read();
  log("按ArrowRight(fb对照) 400ms后", JSON.stringify(s));
  await page.keyboard.up('ArrowRight');
  // 4) wg cursors 结构
  const struct = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var c = L.pers2.cursors;
    return { ctor: c && c.constructor && c.constructor.name, keys: c ? Object.keys(c) : null, w: !!(c && c.up && c.up.event), upKey: c && c.up ? (c.up.keycode ?? c.up.keyCode ?? null) : null };
  });
  log("wg cursors 结构", JSON.stringify(struct));
  await browser.close();
}
main().catch(e => { console.error("[o23f] FAIL", e); process.exit(1); });

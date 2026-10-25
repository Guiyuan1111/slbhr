// oracle 实机旋镜角探针（8788 B bundle）：light_02 @60 物理帧
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await ctx.newPage();
await page.route("**/*", (route) => {
  const u = route.request().url();
  if (!u.startsWith("http://127.0.0.1:8788")) return route.abort();
  if (/\.mp3(\?|$)/.test(u)) return route.abort();
  return route.continue();
});
await page.goto("http://127.0.0.1:8788/gameIndex.html", { waitUntil: "domcontentloaded", timeout: 60000 });
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
await page.waitForFunction(READY_PROG, null, { timeout: 60000 });
const RESOLVE = `(function () {
  var g = require('Phaser').GAMES[0];
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'light'; });
  var hit = temple.levels.find(function (l) { return l.filename.indexOf('/light_02.json') >= 0; });
  return hit ? hit.filename : null;
})()`;
const fname = await page.evaluate(RESOLVE);
await page.waitForFunction(`(() => { try { return require('Phaser').GAMES[0].load.isLoading === false; } catch { return false; } })()`, null, { timeout: 30000 });
await page.waitForTimeout(1200);
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'light'; });
  var levelData = temple.levels.find(function (l) { return l.filename === __FNAME__; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return true;
})()`.replace("__FNAME__", JSON.stringify(fname));
await page.evaluate(NAVIGATE);
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
await page.waitForFunction(READY_LEVEL, null, { timeout: 60000 });
await page.waitForFunction(`(() => { try { return require('Phaser').GAMES[0].physics.box2d.paused === false; } catch { return false; } })()`, null, { timeout: 30000 });
const INSTALL_HOOK = `(function () {
  var g = require('Phaser').GAMES[0];
  var plugin = g.physics.box2d;
  if (window.__vhook) return true;
  window.__vhook = { f: 0, target: 60, done: false };
  var orig = plugin.update;
  plugin.update = function () { orig.call(this); if (!window.__vhook.done && !this.paused) { window.__vhook.f++; if (window.__vhook.f >= window.__vhook.target) window.__vhook.done = true; } };
  return true;
})()`;
await page.evaluate(INSTALL_HOOK);
await page.waitForFunction(`window.__vhook.done === true`, null, { timeout: 30000 });
const angles = await page.evaluate(`(() => {
  var g = require('Phaser').GAMES[0];
  return g.level.objects.filter(function (o) { return o.options.type === 'rotmirror'; }).map(function (o) {
    return { group: o.options.properties.group, deg: +(o.body.data.GetAngle() * 180 / Math.PI).toFixed(1), rot0: +(o.options.rotation || 0) };
  });
})()`);
console.log("oracle light_02 @60f 旋镜:", JSON.stringify(angles));
await browser.close();

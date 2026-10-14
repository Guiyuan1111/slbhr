// oracle 侧：forest_24 r0 Roman 杆自由摆振——ApplyAngularImpulse(5) 后角轨迹 5s
import { chromium } from "playwright";
const log = (...a) => console.log("[s24]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var t = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    var fn = t.levels.find(function (l) { return l.filename.indexOf('/forest_24.json') >= 0; }).filename;
    var Level = require('States/Level/Level');
    var levelData = t.levels.find(function (l) { return l.filename === fn; });
    g.currentTemple = t;
    g.state.add('level', Level);
    g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  });
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await new Promise(r => setTimeout(r, 3000));
  const kick = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var RM = require('States/Level/Devices/Roman');
    var rom = null;
    (L.objects || []).forEach(function (d) { if (!rom && d instanceof RM) rom = d; });
    var bar = rom.joint.GetBodyA();
    var a0 = bar.GetAngle() * 180 / Math.PI;
    try { bar.SetAwake(true); bar.SetAngularVelocity(0.3); } catch (e) { return { err: String(e) }; }
    return { ok: true, a0: Math.round(a0 * 1e3) / 1e3 };
  });
  log("kick:", JSON.stringify(kick));
  const tl = [];
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    const s = await page.evaluate(() => {
      var g = require('Phaser').GAMES[0], L = g.level;
      var RM = require('States/Level/Devices/Roman');
      var rom = null;
      (L.objects || []).forEach(function (d) { if (!rom && d instanceof RM) rom = d; });
      var bar = rom.joint.GetBodyA();
      return Math.round(bar.GetAngle() * 180 / Math.PI * 1e3) / 1e3;
    });
    tl.push(s);
  }
  console.log("oracle angles(°) @250ms:", JSON.stringify(tl));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });

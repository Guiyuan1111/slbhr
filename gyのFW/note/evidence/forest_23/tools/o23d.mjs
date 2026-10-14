// r23b o23d：自然行走探针——不传送，纯键盘
// R5 出生持右（kernel wg-top2：唯一路→goo b21 死）  R6 出生持左  R7 出生站桩4s（机关自治复核）
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = "TEMP/r23b";
const log = (...a) => console.log("[o23d]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const filename = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    return temple.levels.find(function (l) { return l.filename.indexOf('/forest_23.json') >= 0; }).filename;
  });
  const nav = async () => {
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
    await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  };
  await nav();
  log("level ready:", filename);

  const snap = () => page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var px = function (b) { var p = b.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 }; };
    return { wg: px(L.pers2.body.data), wgDead: !!(L.pers2.dead || L.pers2.isDead), won: !!g.level.won };
  });
  const poll = async (ms, step = 300) => { const out = []; const n = Math.ceil(ms / step); for (let i = 0; i < n; i++) { out.push(await snap()); await page.waitForTimeout(step); if (out[out.length - 1].wgDead) break; } return out; };
  const fmt = (t) => t.map(s => `(${s.wg.sx.toFixed(0)},${s.wg.sy.toFixed(0)})${s.wgDead ? "D" : ""}`).join(" ");
  const out = {};

  // ---- R5 出生持右
  log("R5 出生持右 8s");
  await nav();
  const sp = await snap();
  log(`R5 出生位 wg=(${sp.wg.sx.toFixed(0)},${sp.wg.sy.toFixed(0)})`);
  await page.keyboard.down('ArrowRight');
  let r5 = await poll(8000);
  await page.keyboard.up('ArrowRight');
  out.r5 = r5;
  log("R5 轨迹", fmt(r5));

  // ---- R6 出生持左
  log("R6 出生持左 8s");
  await nav();
  await page.keyboard.down('ArrowLeft');
  let r6 = await poll(8000);
  await page.keyboard.up('ArrowLeft');
  out.r6 = r6;
  log("R6 轨迹", fmt(r6));

  // ---- R7 站桩（机关自治）
  log("R7 站桩 5s（无输入）");
  await nav();
  let r7 = await poll(5000);
  out.r7 = r7;
  log("R7 轨迹", fmt(r7));

  writeFileSync(`${OUT}/o23d.out.json`, JSON.stringify(out, null, 1));
  await browser.close();
  log("DONE → TEMP/r23b/o23d.out.json");
}
main().catch(e => { console.error("[o23d] FAIL", e); process.exit(1); });

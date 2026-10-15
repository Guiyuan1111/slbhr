// s34 — oracle 平地跳持键时长扫描（A 台地 fb）+ 重力常量
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667, FRAMES = 220;
const INIT_HOOKS = `
  window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40 };
  window.__dispatchKey = function (type, code) {
    var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
    Object.defineProperty(ev, 'which', { get: function () { return code; } });
    document.dispatchEvent(ev);
  };
`;
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_12_1.json') >= 0; });
  g.currentTemple = temple; g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return true;
})()`;
const GRAV = `(function(){ var p=require('Phaser').GAMES[0].physics.box2d; return { gravityYpx: p.gravity.y, ptm: p.ptmRatio, velIt: p.velocityIterations, posIt: p.positionIterations, useElapsed: p.useElapsedTime }; })()`;
const INSTALL = (script) => `(function () {
  var g = require('Phaser').GAMES[0], L = g.level, plugin = g.physics.box2d, origUpdate = plugin.update;
  window.__cap = { frameIndex: 0, cursor: 0, keyState: {}, samples: [], script: ${JSON.stringify(script)}, maxFrames: ${FRAMES}, stopped: false };
  var cap = window.__cap;
  function r4(v){ return Math.round(v*1e4)/1e4; }
  plugin.update = function () {
    if (cap.stopped) { origUpdate.call(this); return; }
    var s = cap.script;
    while (cap.cursor < s.length && s[cap.cursor].f <= cap.frameIndex) {
      var st = s[cap.cursor++];
      for (var i=0;i<(st.down||[]).length;i++){ var c1=window.__KEYMAP[st.down[i]]; if(c1!=null&&!cap.keyState[st.down[i]]){ cap.keyState[st.down[i]]=true; window.__dispatchKey('keydown',c1);} }
      for (var j=0;j<(st.up||[]).length;j++){ var c2=window.__KEYMAP[st.up[j]]; if(c2!=null&&cap.keyState[st.up[j]]){ cap.keyState[st.up[j]]=false; window.__dispatchKey('keyup',c2);} }
    }
    var dt = ${FIXED_DT}; this.game.time.elapsed = ${FIXED_DT}*1e3;
    origUpdate.call(this);
    if (this.paused) return;
    var p1 = L.pers1.body.data.GetPosition();
    cap.samples.push({ f: cap.frameIndex, y: r4(-32*p1.y) });
    cap.frameIndex++;
    if (cap.frameIndex >= cap.maxFrames) cap.stopped = true;
  };
  return true;
})()`;
const DRAIN = `(function(){ var c=window.__cap; if(!c) return {stopped:true,chunk:[]}; return { stopped:c.stopped, chunk:c.samples.splice(0,c.samples.length) }; })()`;

const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
await page.addInitScript(INIT_HOOKS);
const raw = readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_12_1.json"), "utf8");
const j = JSON.parse(raw);
j.layers.find((l) => l.name === "Chars").objects.find((o) => o.gid === 16).x = 328;
j.layers.find((l) => l.name === "Chars").objects.find((o) => o.gid === 16).y = 700;
await page.route("**/*", (r) => {
  const u = r.request().url();
  if (!u.startsWith("http://127.0.0.1:8787")) return r.abort();
  if (/\.mp3(\?|$)/.test(u)) return r.abort();
  if (/forest_12_1\.json(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
  return r.continue();
});
await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
let ready = false;
for (let a = 0; a < 4 && !ready; a++) {
  await page.evaluate(NAVIGATE);
  try { await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 }); ready = true; } catch {}
}
if (!ready) throw new Error("not ready");
await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
console.log("GRAV:", JSON.stringify(await page.evaluate(GRAV)));

const out = {};
for (const H of [5, 10, 15, 25, 40]) {
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.evaluate(INSTALL([{ f: 80, down: ["up"] }, { f: 80 + H, up: ["up"] }]));
  const frames = [];
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const d = await page.evaluate(DRAIN);
    frames.push(...d.chunk);
    if (d.stopped) break;
  }
  const rest = frames.filter((s) => s.f >= 70 && s.f < 80).pop();
  let min = null;
  for (const s of frames) if (s.f >= 80 && s.f <= 170 && (!min || s.y < min.y)) min = s;
  out["hold" + H] = { restY: rest ? rest.y : null, minY: min ? min.y : null, rise: rest && min ? +(rest.y - min.y).toFixed(1) : null, apexF: min ? min.f : null };
  console.log(`hold=${H}f rise=${out["hold" + H].rise} apex@f${out["hold" + H].apexF}`);
}
await browser.close();
writeFileSync("TEMP/s34-out.json", JSON.stringify(out, null, 1));

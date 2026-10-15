// s35-oracle-14.mjs — forest_14 oracle 对照：r12 台西跳 vs 双楔面（内核 r14 口径：head 停滞 x+y=544，feet apex 259.8）
// 场景（fb gid32 注入 r12 台 center(256,348.8) → obj(224,253)）：
//   VA 静止垂直跳（无方向键）——干净弹道 rise 对照（内核理论 124.2 / oracle A 校准 118.9）
//   WB f80 起 左+跳 持 40f——楔面截停复现（内核停滞点 (318.7,253.5)/(281.7,290.8)/(303.3,269.2)）
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667, FRAMES = 260;
const INIT_HOOKS = `
  window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40 };
  window.__dispatchKey = function (type, code) {
    var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
    Object.defineProperty(ev, 'which', { get: function () { return code; } });
    document.dispatchEvent(ev);
  };
`;
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_14.json') >= 0; });
  if (!levelData) throw new Error('level not found');
  g.currentTemple = temple; g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return true;
})()`;
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
    var p = L.pers1.body.data.GetPosition();
    cap.samples.push({ f: cap.frameIndex, x: r4(-32*p.x), y: r4(-32*p.y + 35.2) });
    cap.frameIndex++;
    if (cap.frameIndex >= cap.maxFrames) cap.stopped = true;
  };
  return true;
})()`;
const DRAIN = `(function(){ var c=window.__cap; if(!c) return {stopped:true,chunk:[]}; return { stopped:c.stopped, chunk:c.samples.splice(0,c.samples.length) }; })()`;

async function runOnce(browserFactory, name, script) {
  const browser = await browserFactory(); // 每场景独立浏览器：同浏览器第二个 context 加载关卡必挂（s33b/s35 实证）
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const j = JSON.parse(readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_14.json"), "utf8"));
  const o = j.layers.find((l) => l.name === "Chars").objects.find((o) => o.gid === 32);
  o.x = 224; // 出生中心 (256,348.8) = r12 台面 feet 384 站立
  o.y = 317;
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return r.abort();
    if (/\.mp3(\?|$)/.test(u)) return r.abort();
    if (/forest_14\.json(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
    return r.continue();
  });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 150)));
  page.on("console", (m) => { const t = m.text(); if (/error|fail|404/i.test(t)) errs.push("console: " + t.slice(0, 150)); });
  let ready = false;
  for (let a = 0; a < 3 && !ready; a++) {
    await page.evaluate(NAVIGATE);
    try {
      await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 });
      ready = true;
    } catch {
      console.log(`[s35] ${name} attempt ${a + 1} failed. errs:`, JSON.stringify(errs.slice(-4)), "state:", await page.evaluate(`(() => { try { const g=require('Phaser').GAMES[0]; const L=g.level; return JSON.stringify({st:g.state.current, lc:!!(L&&L.loadCompleted), pers:!!(L&&L.pers1&&L.pers1.body)}); } catch(e){ return '"'+String(e).slice(0,80)+'"'; } })()`));
    }
  }
  if (!ready) throw new Error("not ready");
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  await page.evaluate(INSTALL(script));
  const frames = [];
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const d = await page.evaluate(DRAIN);
    frames.push(...d.chunk);
    if (d.stopped) break;
  }
  await context.close();
  await browser.close();
  const rest = frames.filter((s) => s.f >= 70 && s.f < 80).pop();
  let min = null;
  for (const s of frames) if (s.f >= 80 && s.f <= 180 && (!min || s.y < min.y)) min = s;
  // WB: head 停滞点 = 首个满足 feet<300 的局部最小 y 帧
  writeFileSync(`TEMP/s35-${name}-trace.json`, JSON.stringify(frames));
  return {
    name, n: frames.length,
    restFeet: rest ? { f: rest.f, x: rest.x, y: rest.y } : null,
    minFeet: min ? { f: min.f, x: min.x, y: min.y } : null,
    rise: rest && min ? +(rest.y - min.y).toFixed(1) : null,
    headMin: min ? { x: min.x, y: +(min.y - 50.72).toFixed(1), d544: +(min.x + (min.y - 50.72) - 544).toFixed(1) } : null,
  };
}

const browserFactory = () => chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true }).catch(() => chromium.launch());
const out = {};
out.VA_vertical = await runOnce(browserFactory, "VA", [{ f: 80, down: ["up"] }, { f: 105, up: ["up"] }]);
out.WB_leftjump = await runOnce(browserFactory, "WB", [{ f: 80, down: ["up", "left"] }, { f: 120, up: ["up"] }]);
writeFileSync("TEMP/s35-out.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

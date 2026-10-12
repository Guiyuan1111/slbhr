// r28b — forest_11 oracle 对照：闸门三探（只读）
// O1 fb(935,864) 跳西越bump → 内核预言：钉在~909-910 滑回 864 板 (~931,864)
// O2 fb(810,864) 东行上bump西坡 → 内核预言：~x839 头顶入板卡死/滑回
// O3 fb(920,690) 池中游西 → 内核预言：浮游爬上滩 (~805,672)（fb 对岩浆免疫）
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
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_11.json') >= 0; });
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
    var dead = !!(L.pers1.dying || L.pers1.dead || L.pers1.isDead);
    cap.samples.push({ f: cap.frameIndex, x: r4(-32*p.x), y: r4(-32*p.y + 35.2), dead: dead });
    cap.frameIndex++;
    if (cap.frameIndex >= cap.maxFrames) cap.stopped = true;
  };
  return true;
})()`;
const DRAIN = `(function(){ var c=window.__cap; if(!c) return {stopped:true,chunk:[]}; return { stopped:c.stopped, chunk:c.samples.splice(0,c.samples.length) }; })()`;

async function runOnce(name, objXY, script) {
  const browser = await chromium.launch({ channel: "msedge", headless: true }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const j = JSON.parse(readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_11.json"), "utf8"));
  const o = j.layers.find((l) => l.name === "Chars").objects.find((o) => o.gid === 16);
  o.x = objXY[0]; o.y = objXY[1];
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return r.abort();
    if (/\.mp3(\?|$)/.test(u)) return r.abort();
    if (/forest_11\.json(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
    return r.continue();
  });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  let ready = false;
  for (let a = 0; a < 3 && !ready; a++) {
    await page.evaluate(NAVIGATE);
    try { await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 }); ready = true; }
    catch { console.log(`[${name}] attempt ${a+1} failed`); }
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
  await context.close(); await browser.close();
  writeFileSync(`TEMP/r28/o11-${name}-trace.json`, JSON.stringify(frames));
  const last = frames[frames.length - 1];
  const marks = [70, 100, 130, 160, 200].map(f => frames.find(s => s.f === f)).filter(Boolean)
    .map(s => `f${s.f}(${s.x.toFixed(0)},${s.y.toFixed(0)})${s.dead ? "!" : ""}`);
  return { name, n: frames.length, marks: marks.join(" "), last: `(${last.x.toFixed(0)},${last.y.toFixed(0)}) dead=${last.dead}` };
}

const out = {};
// O1: center(935,863.8): obj=(903,832)；f70 起 up+left 45f（内核 W7b' 复刻）
out.O1_jumpwest = await runOnce("O1", [903, 832], [{ f: 70, down: ["up", "left"] }, { f: 115, up: ["up", "left"] }]);
// O2: center(810,863.8): obj=(778,832)；f70 起 right 80f（西坡东行卡死复刻）
out.O2_slopeeast = await runOnce("O2", [778, 832], [{ f: 70, down: ["right"] }, { f: 150, up: ["right"] }]);
// O3: center(920,690): obj=(888,658)；f70 起 left 90f（池中游西爬滩复刻 P-E）
out.O3_dishswim = await runOnce("O3", [888, 658], [{ f: 70, down: ["left"] }, { f: 160, up: ["left"] }]);
writeFileSync("TEMP/r28/o11-gate-out.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

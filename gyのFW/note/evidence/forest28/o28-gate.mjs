// r28b — forest_28 oracle 对照：封档三探（只读）
// O1 fb 东行钉 p1 面 + 贴面跳 → 内核预言：钉在 ~1042（p1 西脸1057.9−半宽~15），跳起碰 736 板西缘回落，存活
// O2 wg 水槽床西行 → 内核预言（f28-dive）：被斜楔抬回 segment1，终 ~ (47,255.7) 存活 → l3 密袋封死
// O3 wg 704 池东涉水 → 内核预言：涉水东行出池，过 wg 门区 480-544 存活（wg 门可达）
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";
const FIXED_DT = 0.0166667;
const INIT_HOOKS = `
  window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40, a: 65, w: 87, d: 68 };
  window.__dispatchKey = function (type, code) {
    var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
    Object.defineProperty(ev, 'which', { get: function () { return code; } });
    document.dispatchEvent(ev);
  };
`;
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.pers2.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_28.json') >= 0; });
  if (!levelData) throw new Error('level not found');
  g.currentTemple = temple; g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return true;
})()`;
const INSTALL = (script, frames, roleExpr) => `(function () {
  var g = require('Phaser').GAMES[0], L = g.level, plugin = g.physics.box2d, origUpdate = plugin.update;
  window.__cap = { frameIndex: 0, cursor: 0, keyState: {}, samples: [], script: ${JSON.stringify(script)}, maxFrames: ${frames}, stopped: false };
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
    var P = L.${roleExpr};
    var p = P.body.data.GetPosition();
    var dead = !!(P.dying || P.dead || P.isDead);
    cap.samples.push({ f: cap.frameIndex, x: r4(-32*p.x), y: r4(-32*p.y + 35.2), dead: dead });
    cap.frameIndex++;
    if (cap.frameIndex >= cap.maxFrames) cap.stopped = true;
  };
  return true;
})()`;
const DRAIN = `(function(){ var c=window.__cap; if(!c) return {stopped:true,chunk:[]}; return { stopped:c.stopped, chunk:c.samples.splice(0,c.samples.length) }; })()`;

async function runOnce(name, gid, objXY, script, frames, marks) {
  const browser = await chromium.launch({ channel: "msedge", headless: true }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const j = JSON.parse(readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_28.json"), "utf8"));
  const o = j.layers.find((l) => l.name === "Chars").objects.find((o) => o.gid === gid);
  o.x = objXY[0]; o.y = objXY[1];
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return r.abort();
    if (/\.mp3(\?|$)/.test(u)) return r.abort();
    if (/forest_28\.json(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
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
  await page.evaluate(INSTALL(script, frames, gid === 16 ? "pers1" : "pers2"));
  const out = [];
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const d = await page.evaluate(DRAIN);
    out.push(...d.chunk);
    if (d.stopped) break;
  }
  await context.close(); await browser.close();
  writeFileSync(`TEMP/r28/o28-${name}-trace.json`, JSON.stringify(out));
  const last = out[out.length - 1];
  const mk = marks.map(f => out.find(s => s.f === f)).filter(Boolean)
    .map(s => `f${s.f}(${s.x.toFixed(0)},${s.y.toFixed(0)})${s.dead ? "!" : ""}`);
  return { name, n: out.length, marks: mk.join(" "), last: `(${last.x.toFixed(0)},${last.y.toFixed(0)}) dead=${last.dead}` };
}

const out = {};
// O1: fb 底板(960-1248 顶896) 中 (1000,893)；f70 起 right 钉 p1 西脸；f160 起贴面跳 100f；f260 松
out.O1_p1pin = await runOnce("O1", 16, [968, 890],
  [{ f: 70, down: ["right"] }, { f: 160, down: ["up"] }, { f: 260, up: ["up", "right"] }],
  340, [70, 100, 140, 170, 200, 240, 300]);
// O2: wg 水槽床 H1 (192-352 顶270.4) 中段 (250,267)；f70 起 a 200f → 西行下床、斜楔抬回 attic（对齐内核 dive 探针）
out.O2_wedgedive = await runOnce("O2", 17, [218, 264],
  [{ f: 70, down: ["a"] }, { f: 270, up: ["a"] }],
  330, [70, 100, 130, 160, 200, 250, 310]);
// O3: wg 704 池 (192-416 床718.4) (250,715)；f70 起 d 420f → 涉水东行出池过 wg 门区
out.O3_wadedoor = await runOnce("O3", 17, [218, 712],
  [{ f: 70, down: ["d"] }, { f: 490, up: ["d"] }],
  560, [70, 150, 250, 350, 420, 480, 540]);
writeFileSync("TEMP/r28/o28-gate-out.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

// r16d — forest_16 oracle 对照（只读）：FB 封印四探 + 动体观测
// O1 c29顶(832)跳东 → 内核预言: 板底704/c30底736 压顶, 脚上限~761-793, 落回 c29/峰东斜面 (不过 800)
// O2 峰顶(800)西跑跳 → 内核预言: 45°坡板挡弧, 落洞窟 (792-797,896)（不落 d/c 768）
// O3 FB 西平台东行上水面 → 内核预言: 水面即死 (feet~710 触带)
// O4 双角色注入双门 → 原版 win 链路是否触发（门配对 sanity）
// O5 自然加载采样全部动态刚体 f10 vs f500 位移（平台/杆杠运动规律）
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
  if (!window.h5api) window.h5api = new Proxy({}, { get: () => () => {} });
`;
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.pers2.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/forest_16.json') >= 0; });
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
    var state = '';
    try { state = g.state.current; } catch (e) {}
    cap.samples.push({ f: cap.frameIndex, x: r4(-32*p.x), y: r4(-32*p.y + 35.2), dead: dead, st: state });
    cap.frameIndex++;
    if (cap.frameIndex >= cap.maxFrames) cap.stopped = true;
  };
  return true;
})()`;
const INSTALL_MOVERS = (frames) => `(function () {
  var g = require('Phaser').GAMES[0], plugin = g.physics.box2d, origUpdate = plugin.update;
  window.__cap = { frameIndex: 0, samples: [], maxFrames: ${frames}, stopped: false };
  var cap = window.__cap;
  function snap() {
    var out = [];
    var w = g.physics.box2d.world;
    for (var b = w.GetBodyList(); b; b = b.GetNext()) {
      if (b.IsStatic && b.IsStatic()) continue;
      var t = b.GetType ? b.GetType() : 0;
      if (t === 0) continue;
      var p = b.GetPosition();
      out.push([Math.round(-32*p.x*10)/10, Math.round(-32*p.y*10)/10]);
    }
    return out;
  }
  plugin.update = function () {
    if (cap.stopped) { origUpdate.call(this); return; }
    var dt = ${FIXED_DT}; this.game.time.elapsed = ${FIXED_DT}*1e3;
    origUpdate.call(this);
    if (this.paused) return;
    if (cap.frameIndex === 10) cap.a = snap();
    if (cap.frameIndex === cap.maxFrames - 1) cap.b = snap();
    cap.frameIndex++;
    if (cap.frameIndex >= cap.maxFrames) cap.stopped = true;
  };
  return true;
})()`;
const DRAIN = `(function(){ var c=window.__cap; if(!c) return {stopped:true,chunk:[]}; return { stopped:c.stopped, chunk:c.samples.splice(0,c.samples.length) }; })()`;
const DRAIN_MOVERS = `(function(){ var c=window.__cap; if(!c) return {stopped:true,a:null,b:null}; return { stopped:c.stopped, a:c.a, b:c.b }; })()`;

async function runOnce(name, spawnOverrides, script, frames, marks, roleExpr = "pers1") {
  const browser = await chromium.launch({ channel: "msedge", headless: true }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  const j = JSON.parse(readFileSync(join(process.cwd(), "data", "forest", "levels", "forest_16.json"), "utf8"));
  const objs = j.layers.find((l) => l.name === "Chars").objects;
  for (const [gid, xy] of spawnOverrides) {
    const o = objs.find((o) => o.gid === gid);
    o.x = xy[0]; o.y = xy[1];
  }
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return r.abort();
    if (/\.mp3(\?|$)/.test(u)) return r.abort();
    if (/forest_16\.json(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
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
  await page.evaluate(INSTALL(script, frames, roleExpr));
  const out = [];
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const d = await page.evaluate(DRAIN);
    out.push(...d.chunk);
    if (d.stopped) break;
  }
  await context.close(); await browser.close();
  writeFileSync(`TEMP/r16d/o16-${name}-trace.json`, JSON.stringify(out));
  const last = out[out.length - 1];
  const mk = marks.map(f => out.find(s => s.f === f)).filter(Boolean)
    .map(s => `f${s.f}(${s.x.toFixed(0)},${s.y.toFixed(0)})${s.dead ? "!" : ""}${s.st && s.st !== "level" ? "/" + s.st : ""}`);
  let minY = 1e9, minYf = -1;
  for (const s of out) if (s.y < minY) { minY = s.y; minYf = s.f; }
  return { name, n: out.length, marks: mk.join(" "), minFeet: `f${minYf}:${minY.toFixed(0)}`, last: `(${last.x.toFixed(0)},${last.y.toFixed(0)}) dead=${last.dead} st=${last.st}` };
}

const out = {};
// O1: fb → c29 顶 (940, 832地面线)；f70 跳东（up+right 6f, right 续 40f）
out.O1_c29jump = await runOnce("O1", [[32, [940, 832]]],
  [{ f: 70, down: ["right"] }, { f: 74, down: ["up"] }, { f: 80, up: ["up"] }, { f: 130, up: ["right"] }],
  260, [70, 90, 110, 130, 160, 200, 250]);
// O2: fb → 峰顶 (916, 800地面线)；f70 西跑 f78 跳
out.O2_peakwest = await runOnce("O2", [[32, [916, 800]]],
  [{ f: 70, down: ["left"] }, { f: 78, down: ["up"] }, { f: 84, up: ["up"] }, { f: 160, up: ["left"] }],
  320, [70, 90, 110, 140, 180, 230, 300]);
// O3: fb → 西平台 (300, 704地面线)；f70 东行 240f 走上水面
out.O3_waterwalk = await runOnce("O3", [[32, [300, 704]]],
  [{ f: 70, down: ["right"] }, { f: 310, up: ["right"] }],
  360, [70, 130, 180, 220, 250, 270, 290, 330]);
// O4: fb→FB门(1168,768) wg→WG门(1168,896) 无输入 300f — win?
out.O4_doothold = await runOnce("O4", [[32, [1168, 768]], [33, [1168, 896]]],
  [], 300, [50, 100, 150, 200, 250, 299]);
writeFileSync("TEMP/r16d/o16-gate-out.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

// O5: 动体观测（无注入自然出生，采样动态刚体）
{
  const browser = await chromium.launch({ channel: "msedge", headless: true }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return r.abort();
    if (/\.mp3(\?|$)/.test(u)) return r.abort();
    return r.continue();
  });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  let ready = false;
  for (let a = 0; a < 3 && !ready; a++) {
    await page.evaluate(NAVIGATE);
    try { await page.waitForFunction(READY_LEVEL, null, { timeout: 20000, polling: 100 }); ready = true; }
    catch { }
  }
  if (!ready) throw new Error("O5 not ready");
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  await page.evaluate(INSTALL_MOVERS(500));
  const deadline = Date.now() + 60000;
  let d = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    d = await page.evaluate(DRAIN_MOVERS);
    if (d.stopped) break;
  }
  await context.close(); await browser.close();
  const diff = [];
  if (d && d.a && d.b) {
    for (let i = 0; i < Math.min(d.a.length, d.b.length); i++)
      if (Math.abs(d.a[i][0] - d.b[i][0]) > 0.5 || Math.abs(d.a[i][1] - d.b[i][1]) > 0.5)
        diff.push(`#${i} f10(${d.a[i]}) f500(${d.b[i]})`);
  }
  console.log("O5 movers: total=" + (d && d.a ? d.a.length : "?") + " moved=" + diff.length);
  console.log(diff.join(" | "));
  writeFileSync("TEMP/r16d/o16-movers-out.json", JSON.stringify({ a: d && d.a, b: d && d.b, diff }, null, 1));
}

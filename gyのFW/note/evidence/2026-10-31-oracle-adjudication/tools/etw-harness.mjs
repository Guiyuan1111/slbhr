// etw-harness.mjs — oracle tutorial_water 帧步进输入探针（fw-oracle-etwater 槽；只读 oracle，页内驱动 isDown 标志）
// 用法: node etw-harness.mjs <case.json>
// case.json: { name, frames, program: { "<帧号>": spec, ... } }
//   spec: { fb:{l,r,u}, wg:{l,r,u}, teleport:{who,x,yFeet}, tpObj:{idx,x,y}, stop:true }（缺省帧保持先前键态）
// 坐标约定：screen px；yFeet=脚底物理 y（center+35.2）；teleport 设置 body 中心 (x, yFeet-35.2)
// 产出: <case>.out.json（与 case 同目录）
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname } from "node:path";

// 内嵌只读静态伺服（ROOT=output/E 严格只读，GET/HEAD only，进程退出即自毁）
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/E";
const PORT = 8877;
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".fnt": "text/plain",
  ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".webm": "video/webm",
};
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "gameIndex.html";
      const file = join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      try {
        const st = statSync(file);
        if (!st.isFile()) throw new Error("not file");
        res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Content-Length": st.size });
        if (req.method === "HEAD") res.end();
        else createReadStream(file).pipe(res);
      } catch { res.writeHead(404).end(); }
    });
    srv.on("error", reject);
    srv.listen(PORT, "127.0.0.1", () => resolve(srv));
  });
}

const GAME_URL = "http://127.0.0.1:8877/gameIndex.html";
const caseFile = process.argv[2];
if (!caseFile) { console.error("usage: node etw-harness.mjs <case.json>"); process.exit(1); }
const CASE = JSON.parse(readFileSync(caseFile, "utf8"));
const OUT = caseFile.replace(/\.json$/, ".out.json");

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'water'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('tutorial_water') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return levelData.filename;
})()`;

// 页内 harness：劫持 plugin.update 做帧计数 + 逐帧采样 + 逐帧输入程序
const INSTALL = `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  var fb = L.pers1, wg = L.pers2;
  function keysOf(P) {
    var m = P.cursors || P.char || P;
    return { up: m.up, left: m.left, right: m.right, src: (m.up ? 'cursors' : 'none') };
  }
  window.__keys = { fb: keysOf(fb), wg: keysOf(wg) };
  var H = window.__h = {
    frames: 0, samples: [], prog: JSON.parse(${JSON.stringify(JSON.stringify(CASE.program || {}))}),
    total: ${CASE.frames || 600}, caseName: ${JSON.stringify(CASE.name)}, events: [],
  };
  function setKeys(k, spec) {
    if (!k.up) return;
    k.up.isDown = !!(spec && spec.u);
    k.left.isDown = !!(spec && spec.l);
    k.right.isDown = !!(spec && spec.r);
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function rec(P) {
    var p = P.body.data.GetPosition(), v = P.body.data.GetLinearVelocity();
    return [r2(-p.x * 32), r2(-p.y * 32), r2(-v.x * 32), r2(-v.y * 32), P.isDead ? 1 : 0];
  }
  // 机关快照：全部 L.objects（type + 动态体位置/状态）
  function snapObjs() {
    var m = [];
    (L.objects || []).forEach(function (o, i) {
      var t = o.options && o.options.type;
      var ent = [i, t || o.constructor && o.constructor.name || '?'];
      try {
        if (o.body && o.body.data) {
          var p = o.body.data.GetPosition();
          ent.push(r2(-p.x * 32), r2(-p.y * 32));
          var v = o.body.data.GetLinearVelocity();
          ent.push(r2(-v.y * 32));
        }
        if (o.state !== undefined && o.state !== null) ent.push('st=' + String(o.state));
        if (o.options && o.options.ox != null) ent.push('ox=' + o.options.ox);
      } catch (e) { ent.push('err'); }
      m.push(ent);
    });
    return m;
  }
  function snapshot() {
    var s = { f: H.frames, fb: rec(fb), wg: rec(wg) };
    try {
      s.m = snapObjs();
      s.g = { st: g.state.current, ended: !!L.ended, d1o: !!(L.door1 && L.door1.isOpen), d1u: !!(L.door1 && L.door1.isUp), d2o: !!(L.door2 && L.door2.isOpen), d2u: !!(L.door2 && L.door2.isUp), paused: !!plugin.paused };
    } catch (e) { s.err = String(e); }
    return s;
  }
  plugin.update = function () {
    var h = window.__h;
    if (h.frames >= h.total) { return origUpdate.call(this); }
    var step = h.prog[h.frames];
    if (step) {
      if (step.fb) setKeys(window.__keys.fb, step.fb);
      if (step.wg) setKeys(window.__keys.wg, step.wg);
      if (step.teleport) {
        var P = step.teleport.who === 'wg' ? wg : fb;
        P.body.data.SetPosition(new box2d.b2Vec2(-step.teleport.x / 32, -(step.teleport.yFeet - 35.2) / 32));
        P.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
        if (P.body.data.SetAwake) P.body.data.SetAwake(true); // 该移植 SetPosition 不唤醒入睡体，必须显式唤醒
        h.events.push({ f: h.frames, tp: step.teleport });
      }
      if (step.tpObj != null) {
        var OB = (L.objects || [])[step.tpObj];
        if (OB && OB.body && OB.body.data) {
          OB.body.data.SetPosition(new box2d.b2Vec2(-step.tpObjX / 32, -step.tpObjY / 32));
          OB.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
          if (OB.body.data.SetAwake) OB.body.data.SetAwake(true);
          h.events.push({ f: h.frames, tpObj: step.tpObj, x: step.tpObjX, y: step.tpObjY });
        }
      }
      if (step.stop) { g.physics.box2d.paused = true; h.events.push({ f: h.frames, stopped: true }); }
    }
    this.game.time.elapsed = 1000 / 60;
    origUpdate.call(this);
    h.samples.push(snapshot());
    h.frames++;
  };
  return { installed: true, fbKeys: window.__keys.fb.src, wgKeys: window.__keys.wg.src, objects: (L.objects || []).length };
})()`;

async function main() {
  const srv = await startServer(); // 内嵌伺服；用毕自毁
  mkdirSync("/home/gy/桌面/dev/slbhr/TEMP/fw-oetw-1", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(INSTALL);
  console.log("harness:", JSON.stringify(info));
  await page.waitForFunction("window.__h && window.__h.frames >= window.__h.total", null, { timeout: 600000, polling: 200 });
  const data = await page.evaluate("(function(){ var h=window.__h; return { name: h.caseName, frames: h.frames, events: h.events, samples: h.samples }; })()");
  writeFileSync(OUT, JSON.stringify(data));
  const s = data.samples;
  const minFeet = (who) => Math.min(...s.map((x) => x[who][1] + 35.2));
  const last = s[s.length - 1];
  console.log("case:", data.name, "frames:", data.frames, "events:", JSON.stringify(data.events));
  console.log("last fb:", JSON.stringify(last.fb), "wg:", JSON.stringify(last.wg));
  console.log("min feetY fb:", Math.round(minFeet("fb") * 10) / 10, "wg:", Math.round(minFeet("wg") * 10) / 10);
  console.log("last g:", JSON.stringify(last.g));
  await browser.close();
  srv.close(); // 收尾自毁
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

// oracle-ice02-p1-dump.mjs — ice_02 oracle 实机取证 · 第 1 步：全量静态 dump（E0）
// 产物: tools/artifacts/oracle-ice02-p1-dump.json
// 伺服: 内嵌 http 127.0.0.1:8877 ROOT=Fireboy-and-Watergirl/output/C 严格只读，收尾关闭。
// 坐标: 全文屏幕系（world = -screen/32，01号档头部约定）。
// 内容:
//   E0a grounds: groundBody 全 fixture（顶点/sensor/userData/filter）——甄别冰面/水 tile 标记
//   E0b devices: 全 device（type/props/state/joint tr/body pos/fixtures；timedpusher 额外字段）
//   E0c doors + chars（dims/consts）
//   E0d tilemap 校验: Ground 层 r1c8 / 闸门竖井 r2-r4c8 / row5 门板 / row16 F 瓦（从关卡 JSON 只读另算，见 md 档）
import { chromium } from "playwright";
import { writeFileSync, createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8877;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/C";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-25-ice-temple/tools/artifacts/oracle-ice02-p1-dump.json";
const SHOT_DIR = "/home/gy/桌面/dev/slbhr/TEMP/fw-oi2-1";

const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg", ".fnt": "text/plain", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
function startServer() {
  return new Promise((res) => {
    const srv = http.createServer((req, res2) => {
      if (req.method !== "GET" && req.method !== "HEAD") { res2.writeHead(405).end(); return; }
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "gameIndex.html";
      const file = join(ROOT, p);
      if (!file.startsWith(ROOT)) { res2.writeHead(403).end(); return; }
      try { const st = statSync(file); if (!st.isFile()) throw 0; res2.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Content-Length": st.size }); if (req.method === "HEAD") res2.end(); else createReadStream(file).pipe(res2); }
      catch { res2.writeHead(404).end(); }
    });
    srv.listen(PORT, "127.0.0.1", () => res(srv));
  });
}

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'ice'; });
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('/ice_02.json') >= 0; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename };
})()`;

const DUMP = `(function () {
  var g = require('Phaser').GAMES[0], L = g.level;
  var out = { grounds: [], devices: [], doors: [], chars: [], meta: {}, udHist: {} };
  function sx(v) { return Math.round(-v * 32 * 100) / 100; }
  function wpt(b, v) { var p = b.GetPosition(), c = Math.cos(b.GetAngle()), s = Math.sin(b.GetAngle()); return { x: p.x + c * v.x - s * v.y, y: p.y + s * v.x + c * v.y }; }
  function udOf(f) { try { var ud = f.m_userData; if (ud == null) return null; if (typeof ud === 'object') return JSON.stringify(ud).slice(0, 200); return String(ud).slice(0, 200); } catch (e) { return '(err)'; } }
  function dumpBody(b, tag, dst) {
    for (var f = b.GetFixtureList(); f; f = f.GetNext()) {
      var sh = f.GetShape(), ent = { tag: tag, sensor: f.IsSensor(), ud: udOf(f), filter: { cat: f.GetFilterData().categoryBits, mask: f.GetFilterData().maskBits } };
      var u = ent.ud || ''; out.udHist[u] = (out.udHist[u] || 0) + 1;
      if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
        ent.vertsScreen = sh.m_vertices.map(function (v) { var w = wpt(b, v); return { x: sx(w.x), y: sx(w.y) }; });
      } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape) {
        var w = wpt(b, sh.m_p);
        ent.circleScreen = { cx: sx(w.x), cy: sx(w.y), r: Math.round(sh.m_radius * 32 * 100) / 100 };
      } else ent.shapeType = String(sh.GetType());
      dst.push(ent);
    }
  }
  dumpBody(L.groundBody, 'ground', out.grounds);
  (L.objects || []).forEach(function (o, oi) {
    var d = { idx: oi, type: o.options.type, props: o.options.properties, state: o.state };
    d.box = { x: o.options.x, y: o.options.y, w: Math.round(o.options.width), h: Math.round(o.options.height) };
    try { d.group = o.options.group != null ? o.options.group : (o.options.properties && o.options.properties.group); } catch (e) {}
    if (o.joint) { try { d.tr = Math.round(o.joint.GetJointTranslation() * 1e4) / 1e4; d.trMin = o.joint.GetLowerLimit(); d.trMax = o.joint.GetUpperLimit(); } catch (e) {} }
    if (o.body && o.body.data) { var p = o.body.data.GetPosition(); d.bodyScreen = { x: sx(p.x), y: sx(p.y) }; d.fixtures = []; dumpBody(o.body.data, o.options.type, d.fixtures); }
    if (o.options.type === 'timedpusher') { d.extra = { downState: o.downState, hasTimer: !!o.timer, timerMs: o.timer ? Math.round(o.timer.ms) : null, timeProp: o.options.properties && o.options.properties.time }; }
    if (o.options.type === 'beamer') { d.extra = {}; ['color', 'dir'].forEach(function (k) { try { d.extra[k] = o.options.properties ? o.options.properties[k] : o.options[k]; } catch (e) {} }); try { d.extra.signalState = o.state; } catch (e) {} }
    if (o.options.type === 'portal') { d.inverted = o.options.properties.inverted; d.portalId = o.options.properties.portalId; d.otherIdx = o.other ? (L.objects || []).indexOf(o.other) : null; }
    out.devices.push(d);
  });
  try { ['door1', 'door2'].forEach(function (k, i) { var dd = L[k]; if (dd) out.doors.push({ k: k, char: i ? 'wg' : 'fb', bodyScreen: { x: sx(dd.body.data.GetPosition().x), y: sx(dd.body.data.GetPosition().y) }, isOpen: !!dd.isOpen, isUp: !!dd.isUp, fixtures: [], _f: 1 }); }); out.doors.forEach(function (dd) { var obj = dd.k === 'door1' ? L.door1 : L.door2; dd.fixtures = []; dumpBody(obj.body.data, dd.k, dd.fixtures); delete dd._f; }); } catch (e) { out.doorsErr = String(e); }
  ['pers1', 'pers2'].forEach(function (k) {
    var c = L[k];
    out.chars.push({ k: k, char: c.data.char, originScreen: { x: sx(c.body.data.GetPosition().x), y: sx(c.body.data.GetPosition().y) }, dims: { r1: c.r1, r2: c.r2, dr: c.dr, y1: c.y1, y2: c.y2, maxSpeed: c.defaultMaxSpeed, jumpVelocity: c.jumpVelocity, spriteScale: c.spriteScale } });
  });
  out.meta.mapW = 39 * 32; out.meta.mapH = 29 * 32;
  return out;
})()`;

async function main() {
  const srv = await startServer();
  console.log(`[serve] ${ROOT} @ http://127.0.0.1:${PORT}/gameIndex.html`);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => { if (!String(e).includes("h5api")) console.log("[pageerror]", String(e).slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(400);
  const dump = await page.evaluate(DUMP);
  console.log(`[E0] ground fixtures=${dump.grounds.length} devices=${dump.devices.length} doors=${dump.doors.length}`);
  console.log("devices:", dump.devices.map((d) => `${d.idx}:${d.type}@(${d.box ? d.box.x + "," + d.box.y : "?"}) tr=${d.tr} state=${d.state}`).join(" | "));
  console.log("chars:", dump.chars.map((c) => `${c.k}(${c.char}) @${c.originScreen.x},${c.originScreen.y} max=${c.dims.maxSpeed} jv=${c.dims.jumpVelocity}`).join(" | "));
  console.log("udHist:", JSON.stringify(dump.udHist));
  try { await page.screenshot({ path: `${SHOT_DIR}/p1-dump.png` }); } catch {}
  await browser.close();
  srv.close();
  console.log("[serve] closed");
  writeFileSync(OUT, JSON.stringify(dump, null, 1));
  console.log("written:", OUT);
}

main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

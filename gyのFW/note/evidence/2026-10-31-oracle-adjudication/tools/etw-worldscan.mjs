// etw-worldscan.mjs — 一次性：枚举 oracle 世界全部刚体（含钻石/液体等非 L.objects 体），只读
// 产出: TEMP/fw-oetw-1/etw-worldscan.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/E";
const PORT = 8877;
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".fnt": "text/plain", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
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

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples)); } catch { return false; } })()`;
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
const SCAN = `(function () {
  var g = require('Phaser').GAMES[0];
  var w = g.physics.box2d.world;
  var out = [];
  var b = w.GetBodyList(), n = 0;
  function r2(v) { return Math.round(v * 100) / 100; }
  while (b && n < 600) {
    n++;
    var rec = { i: n, type: b.GetType(), ud: String(b.GetUserData()), pos: null, fixtures: [] };
    try {
      var p = b.GetPosition();
      rec.pos = { sx: r2(-p.x * 32), sy: r2(-p.y * 32) };
      for (var f = b.GetFixtureList(); f; f = f.GetNext()) {
        var sh = f.GetShape(), fr = { sensor: !!f.IsSensor(), ud: f.m_userData ? String(f.m_userData && f.m_userData.type || f.m_userData) : null };
        if (sh.GetType() === box2d.b2ShapeType.e_circleShape) { fr.circle = { r: r2(sh.GetRadius() * 32) }; }
        else if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
          fr.poly = sh.m_vertices.map(function (v2) { return [r2(-v2.x * 32), r2(-v2.y * 32)]; }).filter(function (v2) { return v2[0] !== 0 || v2[1] !== 0; });
        }
        rec.fixtures.push(fr);
      }
    } catch (e) { rec.err = String(e); }
    out.push(rec);
    b = b.GetNext();
  }
  return out;
})()`;

async function main() {
  const srv = await startServer();
  mkdirSync("/home/gy/桌面/dev/slbhr/TEMP/fw-oetw-1", { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:8877/gameIndex.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2000);
  const scan = await page.evaluate(SCAN);
  writeFileSync("/home/gy/桌面/dev/slbhr/TEMP/fw-oetw-1/etw-worldscan.json", JSON.stringify(scan, null, 1));
  console.log("bodies:", scan.length);
  for (const r of scan) {
    const fx = r.fixtures.map((f) => f.circle ? `circle r${f.circle.r}@${JSON.stringify(r.pos)}` : f.poly ? `poly${JSON.stringify(f.poly)}` : "?").join(" | ");
    console.log(`#${r.i} type=${r.type} ud=${r.ud} pos=(${r.pos && r.pos.sx},${r.pos && r.pos.sy}) ${fx}`);
  }
  await browser.close();
  srv.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

// oracle-ice02-diag1.mjs — 踏板实体诊断 + char 落板轨迹（函数式 evaluate，避免字符串转义）
import { chromium } from "playwright";
import { writeFileSync, createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";
const PORT = 8877, ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/C";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-25-ice-temple/tools/artifacts/oracle-ice02-diag1-out.json";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg" };
const srv = await new Promise((res) => {
  const s = http.createServer((q, r) => {
    if (q.method !== "GET") { r.writeHead(405).end(); return; }
    let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
    if (p.endsWith("/")) p += "gameIndex.html";
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT)) { r.writeHead(403).end(); return; }
    try { const st = statSync(f); if (!st.isFile()) throw 0; r.writeHead(200, { "Content-Type": MIME[extname(f)] ?? "application/octet-stream", "Content-Length": st.size }); createReadStream(f).pipe(r); } catch { r.writeHead(404).end(); }
  });
  s.listen(PORT, "127.0.0.1", () => res(s));
});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(`(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes); } catch { return false; } })()`, null, { timeout: 90000, polling: 250 });
await page.evaluate(() => {
  const g = require("Phaser").GAMES[0];
  const Level = require("States/Level/Level");
  const temple = g.progress.attributes.temples.find((t) => t.id === "ice");
  const levelData = temple.levels.find((l) => l.filename.indexOf("/ice_02.json") >= 0);
  g.currentTemple = temple;
  g.state.add("level", Level);
  g.state.start("level", true, false, JSON.parse(JSON.stringify(levelData)));
});
await page.waitForFunction(`(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody && g.physics.box2d.paused === false); } catch { return false; } })()`, null, { timeout: 40000, polling: 100 });
await page.waitForTimeout(300);

const diag = await page.evaluate(() => {
  const g = require("Phaser").GAMES[0], L = g.level;
  let tp = null;
  (L.objects || []).forEach((o) => { if (o.options.type === "timedpusher") tp = o; });
  const out = { tpKeys: Object.keys(tp), joint: null, bodies: [], charDims: {} };
  try {
    const j = tp.joint;
    out.joint = { trans: j.GetJointTranslation(), lim: [j.GetLowerLimit(), j.GetUpperLimit()], motor: j.GetMotorSpeed ? j.GetMotorSpeed() : null };
    ["GetBodyA", "GetBodyB"].forEach((m) => {
      const b = j[m](); if (!b) return;
      const p = b.GetPosition();
      const ent = { side: m, pos: { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100 }, fixtures: [] };
      for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
        const sh = f.GetShape(); const e = { sensor: f.IsSensor() };
        const cc = Math.cos(b.GetAngle()), ss = Math.sin(b.GetAngle());
        if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
          e.verts = sh.m_vertices.map((v) => ({ x: Math.round(-(p.x + cc * v.x - ss * v.y) * 32 * 100) / 100, y: Math.round(-(p.y + ss * v.x + cc * v.y) * 32 * 100) / 100 }));
        } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape) {
          const w = { x: p.x + sh.m_p.x, y: p.y + sh.m_p.y };
          e.circle = { cx: Math.round(-w.x * 32 * 100) / 100, cy: Math.round(-w.y * 32 * 100) / 100, r: Math.round(sh.m_radius * 32 * 100) / 100 };
        }
        ent.fixtures.push(e);
      }
      out.bodies.push(ent);
    });
  } catch (e) { out.jointErr = String(e); }
  const c = L.pers1, d = c.body.data, bp = d.GetPosition();
  const cc = Math.cos(d.GetAngle()), ss = Math.sin(d.GetAngle());
  out.charDims = { pos: { x: Math.round(-bp.x * 32 * 100) / 100, y: Math.round(-bp.y * 32 * 100) / 100 }, r1: c.r1, r2: c.r2, dr: c.dr, y1: c.y1, y2: c.y2, verts: [], circles: [] };
  for (let f = d.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) out.charDims.verts.push(sh.m_vertices.map((v) => ({ x: Math.round(-(bp.x + cc * v.x - ss * v.y) * 32 * 100) / 100, y: Math.round(-(bp.y + ss * v.x + cc * v.y) * 32 * 100) / 100 })));
    if (sh.GetType() === box2d.b2ShapeType.e_circleShape) { const w = { x: bp.x + sh.m_p.x, y: bp.y + sh.m_p.y }; out.charDims.circles.push({ cx: Math.round(-w.x * 32 * 100) / 100, cy: Math.round(-w.y * 32 * 100) / 100, r: Math.round(sh.m_radius * 32 * 100) / 100 }); }
  }
  return out;
});
console.log(JSON.stringify(diag, null, 1));

await page.evaluate(() => {
  const g = require("Phaser").GAMES[0], L = g.level, plugin = g.physics.box2d, ou = plugin.update;
  window.__tr = [];
  const c = L.pers1;
  plugin.update = function () {
    const p = c.body.data.GetPosition();
    let tp = null; (L.objects || []).forEach((o) => { if (o.options.type === "timedpusher") tp = o; });
    window.__tr.push({ f: window.__tr.length, x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, tr: tp ? Math.round(tp.joint.GetJointTranslation() * 1e3) / 1e3 : null });
    if (window.__tr.length >= 220) plugin.update = ou;
    ou.call(this); this.game.time.elapsed = 1000 / 60;
  };
});
await page.waitForTimeout(4000);
const tr = await page.evaluate(() => window.__tr);
console.log("char f0-220 (x,y,tr) 每5帧:");
tr.filter((s, i) => i % 5 === 0).forEach((s) => console.log(" f" + s.f, s.x, s.y, "tr", s.tr));
writeFileSync(OUT, JSON.stringify({ diag, tr }, null, 1));
await browser.close(); srv.close();
console.log("written:", OUT);

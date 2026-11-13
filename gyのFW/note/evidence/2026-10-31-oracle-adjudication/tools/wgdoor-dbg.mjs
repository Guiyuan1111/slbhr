// wgdoor-dbg.mjs — 快速诊断：L.objects 构成 + door 设备字段名
import { chromium } from "playwright";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const PORT = 8876;
const ROOT = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/D";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg", ".fnt": "text/plain", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
const srv = await new Promise((res) => {
  const s = http.createServer((req, res2) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "gameIndex.html";
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res2.writeHead(403).end(); return; }
    try { const st = statSync(file); if (!st.isFile()) throw 0; res2.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Content-Length": st.size }); createReadStream(file).pipe(res2); }
    catch { res2.writeHead(404).end(); }
  });
  s.listen(PORT, "127.0.0.1", () => res(s));
});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
await page.goto(`http://127.0.0.1:${PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(`(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress); } catch { return false; } })()`, null, { timeout: 90000, polling: 250 });
await page.evaluate(`(function(){var g=require('Phaser').GAMES[0];var Level=require('States/Level/Level');var temple=g.progress.attributes.temples.find(function(t){return t.id==='crystal'});var ld=temple.levels.find(function(l){return l.filename.indexOf('/crystal_03.json')>=0});g.currentTemple=temple;g.state.add('level',Level);g.state.start('level',true,false,JSON.parse(JSON.stringify(ld)));})()`);
await page.waitForFunction(`(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.groundBody); } catch { return false; } })()`, null, { timeout: 40000, polling: 100 });
await page.waitForTimeout(500);
const info = await page.evaluate(`(function(){
  var g=require('Phaser').GAMES[0], L=g.level;
  var types={};
  (L.objects||[]).forEach(function(o,i){ types[o.options.type]=(types[o.options.type]||0)+1; if(o.options.type!=='portal'&&o.options.type!=='lever'&&o.options.type!=='box'){ console.log('OBJ',i,o.options.type, JSON.stringify(o.options.properties)); } });
  // doors anywhere?
  var doors=[];
  ['doors','door1','door2'].forEach(function(k){ if(L[k]) doors.push('L.'+k); });
  // search level props
  var lk=Object.keys(L).filter(function(k){return /door/i.test(k)});
  return { types: types, doorKeys: lk, doors: doors, objectsLen: (L.objects||[]).length };
})()`);
console.log(JSON.stringify(info, null, 1));
await browser.close();
srv.close();

// 00-bootstrap.mjs — 探明 E 部运行时结构（只读观测，不写 oracle）
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8873/gameIndex.html";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-oe-1/bootstrap.json";

const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress); } catch { return false; } })()`;

const DUMP = `(function () {
  var g = require('Phaser').GAMES[0];
  var out = {};
  out.gameKeys = Object.keys(g).filter(function(k){ try { return typeof g[k] !== 'function'; } catch(e){ return false; } });
  try { out.progressKeys = Object.keys(g.progress); } catch(e) { out.progressErr = String(e); }
  try { out.progressAttrs = g.progress.attributes ? Object.keys(g.progress.attributes) : null; } catch(e) { out.progressAttrErr = String(e); }
  try {
    out.progressDeep = {};
    ['attributes'].forEach(function(k){
      var a = g.progress[k];
      if (a && typeof a === 'object') {
        Object.keys(a).forEach(function(kk){
          var v = a[kk];
          out.progressDeep[kk] = Array.isArray(v) ? ('array['+v.length+']:'+(v[0]?JSON.stringify(v[0]).slice(0,300):'')) : JSON.stringify(v).slice(0,300);
        });
      }
    });
  } catch(e) { out.progressDeepErr = String(e); }
  try { out.stateKeys = Object.keys(g.state.states); } catch(e) { out.stateErr = String(e); }
  try { out.currentTemple = g.currentTemple ? { id: g.currentTemple.id, keys: Object.keys(g.currentTemple) } : null; } catch(e) {}
  try { out.physics = g.physics ? Object.keys(g.physics) : null; } catch(e) {}
  return out;
})()`;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  console.log("progress ready");
  const dump = await page.evaluate(DUMP);
  writeFileSync(OUT, JSON.stringify(dump, null, 1));
  console.log("written:", OUT);
  await browser.close();
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});

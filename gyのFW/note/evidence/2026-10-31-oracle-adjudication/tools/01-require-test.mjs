// 01-require-test.mjs — 验证页内 require 模块解析
import { chromium } from "playwright";

const GAME_URL = "http://127.0.0.1:8873/gameIndex.html";
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress); } catch { return false; } })()`;
const TEST = `(function(){
  var out={};
  try { var L = require('States/Level/Level'); out.levelState = typeof L; out.levelKeys = L ? Object.keys(L).slice(0,10) : null; } catch(e) { out.levelStateErr = String(e); }
  try { out.phaserType = typeof require('Phaser'); } catch(e) { out.phaserErr = String(e); }
  try { out.requireNames = Object.keys(require.s && require.s.contexts ? {} : {}).length; } catch(e){}
  try { out.ctxIds = require.s ? Object.keys(require.s.contexts) : null; } catch(e){}
  try {
    if (require.s && require.s.contexts && require.s.contexts._) {
      var reg = require.s.contexts._.config.registry || require.s.contexts._.registry;
      out.registryType = typeof reg;
      if (reg) out.regKeys = Object.keys(reg).filter(function(k){return k.indexOf('tates')>=0||k.indexOf('Phaser')>=0;}).slice(0,20);
    }
  } catch(e) { out.regErr = String(e); }
  return out;
})()`;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const r = await page.evaluate(TEST);
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });

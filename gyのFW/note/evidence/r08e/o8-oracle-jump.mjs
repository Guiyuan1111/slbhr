// r19c o19：oracle 活体对拍 forest_19 —— (T1) 井口封带坚实在原版引擎成立吗 (T2) 龛顶跳升实测 (T3) 隧道/井筒内部连通确认
// 坐标：phys = (−screenX/32, −screenY/32)；SetPosition 可用（25号档）
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "TEMP/main-oracle";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[o8]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const filename = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    return temple.levels.find(function (l) { return l.filename.indexOf('/forest_08.json') >= 0; }).filename;
  });
  await page.evaluate((fn) => {
    var g = require('Phaser').GAMES[0];
    var Level = require('States/Level/Level');
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    var levelData = temple.levels.find(function (l) { return l.filename === fn; });
    g.currentTemple = temple;
    g.state.add('level', Level);
    g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  }, filename);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 40000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
  log("level ready:", filename);

  const snap = () => page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var px = function (b) { var p = b.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 }; };
    return {
      fb: px(L.pers1.body.data), wg: px(L.pers2.body.data),
      fbDead: !!L.pers1.dead, wgDead: !!L.pers2.dead, ph: g.level.won
    };
  });
  const s0 = await snap();
  log(`出生位 fb=(${s0.fb.sx.toFixed(1)},${s0.fb.sy.toFixed(1)}) wg=(${s0.wg.sx.toFixed(1)},${s0.wg.sy.toFixed(1)})`);
  const poll = async (ms, step = 250) => { const out = []; const n = Math.ceil(ms / step); for (let i = 0; i < n; i++) { out.push(await snap()); await page.waitForTimeout(step); } return out; };
  const teleport = (who, sx, sy) => page.evaluate(([w, x, y]) => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var body = (w === 'fb' ? L.pers1 : L.pers2).body.data;
    var V = body.GetPosition().constructor;
    try { body.SetLinearVelocity(new V(0, 0)); } catch (e) { try { body.SetLinearVelocity({ x: 0, y: 0 }); } catch (e2) {} }
    body.SetPosition(new V(-x / 32, -y / 32));
    var p = body.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 };
  }, [who, sx, sy]);

  // ---- 仲裁实测：r16E 西缘原地满跳升量（r08e 需 128.0px 上 slab 顶）
  log("r16E 西缘：fb→(505,505) 落 r16E 顶 y512");
  log("落点回读", JSON.stringify(await teleport('fb', 505, 505)));
  await page.waitForTimeout(1500);
  let s = await snap();
  log("落定", `fb=(${s.fb.sx.toFixed(1)},${s.fb.sy.toFixed(1)}) dead=${s.fbDead}`);
  const page2 = page;
  let best = 0;
  for (let j = 0; j < 3; j++) {
    const y0 = (await snap()).fb.sy;
    await page2.keyboard.down('ArrowUp');
    await page2.waitForTimeout(150);
    await page2.keyboard.up('ArrowUp');
    let minY = y0;
    for (let i = 0; i < 14; i++) { await page2.waitForTimeout(60); const cur = (await snap()).fb.sy; if (cur < minY) minY = cur; }
    const rise = y0 - minY;
    if (rise > best) best = rise;
    log(`跳${j + 1}: 起点 feet=${y0.toFixed(1)} 最高 feet=${minY.toFixed(1)} 净升=${rise.toFixed(1)}`);
  }
  // 跳+左漂（slab 在西北）：最高 feet 与最西 x
  const y0 = (await snap()).fb.sy;
  await page2.keyboard.down('ArrowUp'); await page2.keyboard.down('ArrowLeft');
  await page2.waitForTimeout(150);
  await page2.keyboard.up('ArrowUp');
  let minY = y0, minX = 9999, atMin = null;
  for (let i = 0; i < 16; i++) { await page2.waitForTimeout(60); const c = (await snap()).fb; if (c.sy < minY) { minY = c.sy; atMin = c.sx; } if (c.sx < minX) minX = c.sx; }
  await page2.keyboard.up('ArrowLeft');
  log(`跳+左: 最高 feet=${minY.toFixed(1)} 最西 x=${minX.toFixed(1)} @最高点x=${atMin?.toFixed(1)} dead=${(await snap()).fbDead}`);
  log("三跳最大净升 =", best.toFixed(1), "（r08e 仲裁线：需 ≥128 上 slab 顶 c_stand 348.1）");

  writeFileSync(`${OUT}/o8.out.json`, JSON.stringify({ best, at: Date.now() }, null, 1));
  await browser.close();
  log("DONE → TEMP/main-oracle/o8.out.json");
}
main().catch(e => { console.error(e); process.exit(1); });

// r23b o23h：修正时序——nav 后 2s 延迟再按键；teleport 重试直到位置回读≠出生
// R5 出生持D 8s  R6 出生持A 8s  R8 jam笼+持D
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = "TEMP/r23b";
const log = (...a) => console.log("[o23h]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
  const filename = await page.evaluate(() => {
    var g = require('Phaser').GAMES[0];
    var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
    return temple.levels.find(function (l) { return l.filename.indexOf('/forest_23.json') >= 0; }).filename;
  });
  const nav = async () => {
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
    await page.waitForTimeout(2000);
  };
  await nav();
  log("level ready:", filename);

  const snap = () => page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var px = function (b) { var p = b.GetPosition(); var v = b.GetLinearVelocity(); return { sx: -p.x * 32, sy: -p.y * 32, vx: -v.x * 32 }; };
    return { wg: px(L.pers2.body.data), wgDead: !!(L.pers2.dead || L.pers2.isDead), won: !!g.level.won };
  });
  const poll = async (ms, step = 300) => { const out = []; const n = Math.ceil(ms / step); for (let i = 0; i < n; i++) { out.push(await snap()); await page.waitForTimeout(step); if (out[out.length - 1].wgDead) break; } return out; };
  const teleport = (sx, sy) => page.evaluate(([x, y]) => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var body = L.pers2.body.data;
    var V = body.GetPosition().constructor;
    try { body.SetLinearVelocity(new V(0, 0)); } catch (e) { try { body.SetLinearVelocity({ x: 0, y: 0 }); } catch (e2) {} }
    body.SetPosition(new V(-x / 32, -y / 32));
    var p = body.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 };
  }, [sx, sy]);
  const fmt = (t) => t.map(s => `(${s.wg.sx.toFixed(0)},${s.wg.sy.toFixed(0)})v${s.wg.vx.toFixed(0)}${s.wgDead ? "D" : ""}`).join(" ");
  const out = {};

  // ---- R5 出生持D 8s
  log("R5 wg出生持D 8s");
  await nav();
  let s0 = await snap();
  log(`R5 出生 (${s0.wg.sx.toFixed(0)},${s0.wg.sy.toFixed(0)})`);
  await page.keyboard.down('d');
  let r5 = await poll(8000);
  await page.keyboard.up('d');
  out.r5 = r5;
  log("R5 轨迹", fmt(r5));

  // ---- R6 出生持A 8s
  log("R6 wg出生持A 8s");
  await nav();
  await page.keyboard.down('a');
  let r6 = await poll(8000);
  await page.keyboard.up('a');
  out.r6 = r6;
  log("R6 轨迹", fmt(r6));

  // ---- R8 jam笼+持D（teleport 重试）
  log("R8 jam笼(462,412)+持D 5s");
  await nav();
  let ok = false;
  for (let k = 0; k < 6 && !ok; k++) {
    await teleport(462, 412);
    await page.waitForTimeout(500);
    const c = await snap();
    log(`  R8 尝试${k + 1}: 位置=(${c.wg.sx.toFixed(0)},${c.wg.sy.toFixed(0)}) ${Math.abs(c.wg.sx - 462) < 30 ? "钉住✓" : "回弹✗"}`);
    if (Math.abs(c.wg.sx - 462) < 30) ok = true;
  }
  if (ok) {
    await page.keyboard.down('d');
    let r8 = await poll(5000);
    await page.keyboard.up('d');
    out.r8 = r8;
    const xs = r8.map(s => s.wg.sx);
    log("R8 轨迹", fmt(r8));
    log(`R8 x域 [${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] 末态 dead=${r8[r8.length - 1].wgDead}`);
  } else {
    log("R8 teleport 无法钉住（记录为发现）");
    out.r8 = "teleport-unstuck";
  }

  writeFileSync(`${OUT}/o23h.out.json`, JSON.stringify(out, null, 1));
  await browser.close();
  log("DONE → TEMP/r23h.out.json".replace("TEMP/r23h", "TEMP/r23b/o23h"));
}
main().catch(e => { console.error("[o23h] FAIL", e); process.exit(1); });

// r23b o23b：修正传送落点（oracle feet=center+17.6）
// T1 goo板双解释扫描 T3 台地顶(v34落点feet352→center317) T4 池内直落(827/900,830)
// T5 走廊center690(feet725.6)纯跳→桌底bonk T3b jam楔静息跳
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = "TEMP/r23b";
const log = (...a) => console.log("[o23b]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
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
  await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  log("level ready:", filename);

  const snap = () => page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var px = function (b) { var p = b.GetPosition(); var v = b.GetLinearVelocity(); return { sx: -p.x * 32, sy: -p.y * 32, vx: -v.x * 32, vy: -v.y * 32 }; };
    return { wg: px(L.pers2.body.data), wgDead: !!(L.pers2.dead || L.pers2.isDead), fbDead: !!(L.pers1.dead || L.pers1.isDead), won: !!g.level.won };
  });
  const poll = async (ms, step = 200) => { const out = []; const n = Math.ceil(ms / step); for (let i = 0; i < n; i++) { out.push(await snap()); await page.waitForTimeout(step); if (out[out.length - 1].wgDead) break; } return out; };
  const teleport = (sx, sy) => page.evaluate(([x, y]) => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var body = L.pers2.body.data;
    var V = body.GetPosition().constructor;
    try { body.SetLinearVelocity(new V(0, 0)); } catch (e) { try { body.SetLinearVelocity({ x: 0, y: 0 }); } catch (e2) {} }
    body.SetPosition(new V(-x / 32, -y / 32));
    var p = body.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 };
  }, [sx, sy]);
  const settle = async (ms = 700) => { await page.waitForTimeout(ms); return snap(); };
  const fmt = (t) => t.map(s => `(${s.wg.sx.toFixed(0)},${s.wg.sy.toFixed(0)})${s.wgDead ? "D" : ""}`).join(" ");

  // ---- T1 goo板扫描：中心 y∈{266,284} x∈{500,560,640,720}，落定1.2s判死
  log("T1 goo板扫描（落在 goo [480,768]@288 区内）");
  let t1hits = [];
  for (const y of [266, 284]) {
    for (const x of [500, 560, 640, 720]) {
      if ((await snap()).wgDead) break;
      await teleport(x, y);
      const s = await settle(1200);
      log(`  T1 (${x},${y}) → 落定 (${s.wg.sx.toFixed(0)},${s.wg.sy.toFixed(0)}) dead=${s.wgDead}`);
      if (s.wgDead) { t1hits.push({ x, y, at: [ +s.wg.sx.toFixed(1), +s.wg.sy.toFixed(1) ] }); break; }
    }
    if (t1hits.length) break;
  }
  log("T1 命中:", JSON.stringify(t1hits));

  // ---- T3 台地顶：v34 kernel 刹车落点 (309,352 feet) → center 317；跳+右 测东向出口
  log("T3 台地顶：wg→(309,317)");
  await teleport(309, 317);
  let s3 = await settle(900);
  log(`T3 落定 (${s3.wg.sx.toFixed(0)},${s3.wg.sy.toFixed(0)}) feet=${(s3.wg.sy + 17.6).toFixed(1)} dead=${s3.wgDead}`);
  for (let j = 0; j < 3 && !s3.wgDead; j++) {
    const y0 = (await snap()).wg.sy;
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowUp');
    let maxX = -9999, minSy = 9999;
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(120); const c = (await snap()).wg; if (c.sy < minSy) minSy = c.sy; if (c.sx > maxX) maxX = c.sx; if ((await snap()).wgDead) break; }
    await page.keyboard.up('ArrowRight');
    const cur = await settle(300);
    log(`T3 跳${j + 1}: feet0=${(y0 + 17.6).toFixed(0)} 最高feet=${(minSy + 17.6).toFixed(0)} 最东x=${maxX.toFixed(0)} 终态=(${cur.wg.sx.toFixed(0)},${cur.wg.sy.toFixed(0)}) dead=${cur.wgDead}`);
    if (cur.wgDead) break;
  }
  let t3 = await poll(1500);
  log("T3 尾迹", fmt(t3));

  // ---- T4 池内直落：b15 [768,960]@864 → center (827,830)/(900,830)
  log("T4 goo池直落");
  for (const [x, y] of [[827, 830], [900, 830]]) {
    if ((await snap()).wgDead) break;
    await teleport(x, y);
    let t4 = await poll(2000);
    log(`  T4 (${x},${y}) →`, fmt(t4));
    if (t4[t4.length - 1].wgDead) break;
  }

  // ---- T5 走廊纯跳：center 690 → feet 725.6 走廊内；纯跳×3 → 桌底672 bonk（最高feet≈707）
  log("T5 走廊纯跳：wg→(656,690)");
  await teleport(656, 690);
  let s5 = await settle(900);
  log(`T5 落定 (${s5.wg.sx.toFixed(0)},${s5.wg.sy.toFixed(0)}) feet=${(s5.wg.sy + 17.6).toFixed(1)} dead=${s5.wgDead}`);
  for (let j = 0; j < 3 && !s5.wgDead; j++) {
    const y0 = (await snap()).wg.sy;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowUp');
    let minSy = 9999;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); const c = (await snap()).wg.sy; if (c < minSy) minSy = c; }
    const cur = await settle(300);
    log(`T5 跳${j + 1}: feet0=${(y0 + 17.6).toFixed(1)} 最高feet=${(minSy + 17.6).toFixed(1)}（桌底672→极限feet707.2） 终态feet=${(cur.wg.sy + 17.6).toFixed(1)} dead=${cur.wgDead}`);
    await page.waitForTimeout(300);
  }

  const fin = await snap();
  writeFileSync(`${OUT}/o23b.out.json`, JSON.stringify({ t1hits, t3, fin }, null, 1));
  await browser.close();
  log("DONE → TEMP/r23b/o23b.out.json");
}
main().catch(e => { console.error("[o23b] FAIL", e); process.exit(1); });

// r23b o23c：每场景全新加载关卡（避免 dead 残留污染）
// R1 台地顶(309,317)跳+右×3  R2 goo池直落(827,830)  R3 走廊(656,690)纯跳×3  R4 池盖复核(864,780)
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = "TEMP/r23b";
const log = (...a) => console.log("[o23c]", ...a);
const READY_PROG = () => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } };
const READY_LEVEL = () => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } };
const READY_PHYS = () => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } };

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
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
    await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
  };
  await nav();
  log("level ready:", filename);

  const snap = () => page.evaluate(() => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var px = function (b) { var p = b.GetPosition(); var v = b.GetLinearVelocity(); return { sx: -p.x * 32, sy: -p.y * 32, vx: -v.x * 32, vy: -v.y * 32 }; };
    return { wg: px(L.pers2.body.data), wgDead: !!(L.pers2.dead || L.pers2.isDead), won: !!g.level.won };
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
  const settle = async (ms = 800) => { await page.waitForTimeout(ms); return snap(); };
  const fmt = (t) => t.map(s => `(${s.wg.sx.toFixed(0)},${s.wg.sy.toFixed(0)})${s.wgDead ? "D" : ""}`).join(" ");
  const out = {};

  // ---- R1 台地顶跳+右×3
  log("R1 台地顶 (309,317) 跳+右×3");
  await nav();
  await teleport(309, 317);
  const s1 = await settle();
  log(`R1 落定 (${s1.wg.sx.toFixed(0)},${s1.wg.sy.toFixed(0)}) feet=${(s1.wg.sy + 17.6).toFixed(1)} dead=${s1.wgDead}`);
  out.r1 = [{ settle: s1 }];
  for (let j = 0; j < 3 && !s1.wgDead; j++) {
    const y0 = (await snap()).wg.sy;
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowUp');
    let maxX = -9999, minSy = 9999;
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(120); const c = (await snap()).wg; if (c.sy < minSy) minSy = c.sy; if (c.sx > maxX) maxX = c.sx; }
    await page.keyboard.up('ArrowRight');
    const cur = await settle(300);
    const rec = { j: j + 1, feet0: +(y0 + 17.6).toFixed(1), maxFeet: +(minSy + 17.6).toFixed(1), maxX: +maxX.toFixed(1), end: [ +cur.wg.sx.toFixed(1), +cur.wg.sy.toFixed(1) ], dead: cur.wgDead };
    out.r1.push(rec);
    log(`R1 跳${j + 1}: feet0=${rec.feet0} 最高feet=${rec.maxFeet} 最东x=${rec.maxX} 终态=(${rec.end[0]},${rec.end[1]}) dead=${rec.dead}`);
    if (cur.wgDead) break;
    await page.waitForTimeout(300);
  }
  let tail = await poll(1500);
  out.r1tail = tail;
  log("R1 尾迹", fmt(tail.slice(-4)));

  // ---- R2 goo池直落 (827,830)
  log("R2 goo池直落 (827,830)");
  await nav();
  await teleport(827, 830);
  let t2 = await poll(2500);
  out.r2 = t2;
  log("R2 轨迹", fmt(t2));

  // ---- R3 走廊纯跳×3
  log("R3 走廊 (656,690) 纯跳×3");
  await nav();
  await teleport(656, 690);
  const s3 = await settle();
  log(`R3 落定 (${s3.wg.sx.toFixed(0)},${s3.wg.sy.toFixed(0)}) feet=${(s3.wg.sy + 17.6).toFixed(1)} dead=${s3.wgDead}`);
  out.r3 = [{ settle: s3 }];
  for (let j = 0; j < 3 && !s3.wgDead; j++) {
    const y0 = (await snap()).wg.sy;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowUp');
    let minSy = 9999;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); const c = (await snap()).wg.sy; if (c < minSy) minSy = c; }
    const cur = await settle(300);
    const rec = { j: j + 1, feet0: +(y0 + 17.6).toFixed(1), maxFeet: +(minSy + 17.6).toFixed(1), endFeet: +(cur.wg.sy + 17.6).toFixed(1), dead: cur.wgDead };
    out.r3.push(rec);
    log(`R3 跳${j + 1}: feet0=${rec.feet0} 最高feet=${rec.maxFeet}（桌底672→极限feet707.2） 终态feet=${rec.endFeet} dead=${rec.dead}`);
    await page.waitForTimeout(300);
  }

  // ---- R4 池盖复核 (864,780)
  log("R4 (864,780) 落点复核（o23 曾冻结）");
  await nav();
  await teleport(864, 780);
  let t4 = await poll(2500);
  out.r4 = t4;
  log("R4 轨迹", fmt(t4));

  writeFileSync(`${OUT}/o23c.out.json`, JSON.stringify(out, null, 1));
  await browser.close();
  log("DONE → TEMP/r23b/o23c.out.json");
}
main().catch(e => { console.error("[o23c] FAIL", e); process.exit(1); });

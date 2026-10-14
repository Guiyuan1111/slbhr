// r23b o23：oracle 活体对拍 forest_23 wg 封印五链
// T1 顶中goo（板面feet302踏上[480,768]goo即死） T2 jam笼持右永钉
// T3 台地死胡同东跳 T4 b15护城河落水死 T5 底阶桌sluice顶棚
// 坐标：phys=(-screen/32)；teleport 传中心screen坐标
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = "TEMP/r23b";
const log = (...a) => console.log("[o23]", ...a);
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
    return {
      fb: px(L.pers1.body.data), wg: px(L.pers2.body.data),
      wgDead: !!(L.pers2.dead || L.pers2.isDead), fbDead: !!(L.pers1.dead || L.pers1.isDead), won: !!g.level.won
    };
  });
  const poll = async (ms, step = 250) => { const out = []; const n = Math.ceil(ms / step); for (let i = 0; i < n; i++) { out.push(await snap()); await page.waitForTimeout(step); if (out[out.length - 1].wgDead) break; } return out; };
  const teleport = (who, sx, sy) => page.evaluate(([w, x, y]) => {
    var g = require('Phaser').GAMES[0], L = g.level;
    var body = (w === 'fb' ? L.pers1 : L.pers2).body.data;
    var V = body.GetPosition().constructor;
    try { body.SetLinearVelocity(new V(0, 0)); } catch (e) { try { body.SetLinearVelocity({ x: 0, y: 0 }); } catch (e2) {} }
    body.SetPosition(new V(-x / 32, -y / 32));
    var p = body.GetPosition(); return { sx: -p.x * 32, sy: -p.y * 32 };
  }, [who, sx, sy]);
  const fmt = (t) => t.map(s => `(${s.wg.sx.toFixed(0)},${s.wg.sy.toFixed(0)})v${s.wg.vx.toFixed(0)}${s.wgDead ? "D" : ""}`).join(" ");

  // ---- T1 顶中goo：wg→(440,284)（goo板西侧立足 feet≈301），持右 → 踏 [480,768] 即死
  log("T1 顶中goo：wg→(440,284) 持右");
  log("T1 落点回读", JSON.stringify(await teleport('wg', 440, 284)));
  await page.keyboard.down('ArrowRight');
  let t1 = await poll(3500);
  await page.keyboard.up('ArrowRight');
  log("T1 轨迹", fmt(t1));

  // ---- T2 jam笼：wg→(462,412)（feet≈430），持右 5s → 永钉不出、不死
  log("T2 jam笼持右：wg→(462,412)");
  await teleport('wg', 462, 412);
  await page.waitForTimeout(800);
  await page.keyboard.down('ArrowRight');
  let t2 = await poll(5000);
  await page.keyboard.up('ArrowRight');
  const t2xmin = Math.min(...t2.map(s => s.wg.sx)), t2xmax = Math.max(...t2.map(s => s.wg.sx));
  log("T2 轨迹", fmt(t2.slice(-6)));
  log(`T2 x域 [${t2xmin.toFixed(0)},${t2xmax.toFixed(0)}] 末态 v${t2[t2.length - 1].wg.vx.toFixed(0)} dead=${t2[t2.length - 1].wgDead}`);

  // ---- T3 台地死胡同：wg→(309,334)（feet≈352），跳+右×3 → 东向无出口
  log("T3 台地东跳：wg→(309,334)");
  await teleport('wg', 309, 334);
  await page.waitForTimeout(800);
  let t3 = [];
  for (let j = 0; j < 3; j++) {
    const y0 = (await snap()).wg.sy;
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowUp');
    let maxX = 0, minSy = 9999, endWait = 1200;
    for (let i = 0; i < endWait / 120; i++) {
      await page.waitForTimeout(120);
      const c = (await snap()).wg;
      if (c.sy < minSy) minSy = c.sy;
      if (c.sx > maxX) maxX = c.sx;
      if (c.wgDead) break;
    }
    await page.keyboard.up('ArrowRight');
    const cur = await snap();
    t3.push({ j, y0: +y0.toFixed(1), minSy: +minSy.toFixed(1), maxX: +maxX.toFixed(1), end: { x: +cur.wg.sx.toFixed(1), sy: +cur.wg.sy.toFixed(1) }, dead: cur.wgDead });
    log(`T3 跳${j + 1}: feet0=${(y0 + 35.2).toFixed(0)} 最低中心=${minSy.toFixed(0)} 最东x=${maxX.toFixed(0)} 终态=(${cur.wg.sx.toFixed(0)},${cur.wg.sy.toFixed(0)})${cur.wgDead ? " DEAD" : ""}`);
    if (cur.wgDead) break;
    await page.waitForTimeout(400);
  }

  // ---- T4 护城河：wg→(864,780) 落入 b15 goo [768,960]@864 → 死
  log("T4 goo护城河：wg→(864,780) 自由落");
  await teleport('wg', 864, 780);
  let t4 = await poll(2500, 200);
  log("T4 轨迹", fmt(t4));

  // ---- T5 桌sluice：wg→(656,718)（底阶顶 feet≈736），纯跳×3 → 头撞桌底672（feet≈707）
  log("T5 桌sluice：wg→(656,718) 纯跳×3");
  await teleport('wg', 656, 718);
  await page.waitForTimeout(800);
  for (let j = 0; j < 3; j++) {
    const y0 = (await snap()).wg.sy;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowUp');
    let minSy = 9999;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); const c = (await snap()).wg.sy; if (c < minSy) minSy = c; }
    const cur = await snap();
    log(`T5 跳${j + 1}: feet0=${(y0 + 35.2).toFixed(1)} 最高feet=${(minSy + 35.2).toFixed(1)}（头=${minSy.toFixed(1)}，桌底672） 终态feet=${(cur.wg.sy + 35.2).toFixed(1)} dead=${cur.wgDead}`);
    await page.waitForTimeout(400);
  }

  const fin = await snap();
  writeFileSync(`${OUT}/o23.out.json`, JSON.stringify({ t1, t2: { xmin: t2xmin, xmax: t2xmax, tail: t2.slice(-4) }, t3, t4, t5note: "见日志", fin }, null, 1));
  await browser.close();
  log("DONE → TEMP/r23b/o23.out.json");
}
main().catch(e => { console.error("[o23] FAIL", e); process.exit(1); });

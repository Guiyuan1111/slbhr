/**
 * p5-micro：实验 B——ORACLE_SOLVED 后的鲁棒性/人手可行性映射（原"微操挤缝"目标已被 A 的 HIT 取代）。
 *  B1 起跳时机抖动：x=790 pre∈{0.5,0.75,1,1.25,1.5}f × hold∈{12,16,20,24}f —— 20 组成功率图
 *  B2 输入模式变体：W先A后 / A顶点放 / A脉冲 / A+D空中刹车 —— 4 组
 *  B3 站位精度：x∈{785.5,787,789,791.5,793} hold20 pre1 —— 5 组
 *  B4 阻塞区对照（记录用）：x∈{780,782,784}×pre{3,5} hold40 —— 6 组
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG, FB } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p5] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);
const F = 16.7;
const FLOOR_CORE = 860.54;
const P3_EAST_X = 700.26;
const TOP_LO = 758, TOP_HI = 779, XLO = 632, XHI = 768;

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(4000);
const sampler = await attachSampler(page);

const readWorld = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const px = (m) => -32 * m;
    const grab = (p) => {
      if (!p || !p.body || !p.body.data) return null;
      const d = p.body.data, pos = d.GetPosition(), v = d.GetLinearVelocity();
      if (!pos) return null;
      return { x: +px(pos.x).toFixed(2), y: +px(pos.y).toFixed(2), vx: +(px(v.x)).toFixed(2), vy: +(px(v.y)).toFixed(2), awake: d.IsAwake() };
    };
    const grp = g.MechManager?.deviceGroups?.[3];
    const lever = grp?.find((d) => d.options?.type === "lever");
    const p3 = grp?.find((d) => d.options?.type === "platform");
    const pp = p3?.body?.data?.GetPosition();
    return { st: g.state.current, wg: grab(lv?.pers2), fb: grab(lv?.pers1), lever: lever ? lever.state : null, p3x: pp ? +px(pp.x).toFixed(2) : null, paused: g.physics.box2d.paused };
  });

const tpWg = async (x) => {
  await page.evaluate((xx) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -860.54 / 32 });
  }, x);
  for (let i = 0; i < 32; i++) {
    await sleep(50);
    const s = await readWorld();
    if (!s.wg) return null;
    if (!s.wg.awake || (s.wg.vy === 0 && Math.abs(s.wg.y - FLOOR_CORE) < 0.5 && Math.abs(s.wg.x - x) < 2)) return s.wg;
  }
  return (await readWorld()).wg;
};

let setupCount = 0;
async function fullSetup() {
  setupCount++;
  log(`FULL SETUP #${setupCount}`);
  const st = await page.evaluate(() => window.Phaser.GAMES[0].state.current);
  if (st === "level") await page.evaluate(() => { window.Phaser.GAMES[0].level.retry(); });
  else await page.evaluate(() => { window.Phaser.GAMES[0].state.states.menu.skipToLevel({ id: 5, filename: "forest/levels/forest_05.json", required: 0 }); });
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    return g.state.current === "level" && !!g.level?.pers2 && g.level.levelStarted;
  }, { timeout: 30000 });
  await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
  await sleep(2500);
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers1.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -470 / 32, y: -668.8 / 32 });
  });
  await sleep(500);
  await page.keyboard.down(FB.left);
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    const lever = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "lever");
    return lever.state === 1;
  }, { timeout: 8000 });
  await sleep(300);
  await page.keyboard.up(FB.left).catch(() => {});
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
    const v = p3.body.data.GetLinearVelocity();
    return Math.abs(-32 * v.x) < 0.5 && -32 * p3.body.data.GetPosition().x > 690;
  }, { timeout: 8000 });
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers1.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -1010 / 32, y: -508.8 / 32 });
  });
  await sleep(600);
  const w = await readWorld();
  if (!w.wg || w.lever !== 1 || Math.abs(w.p3x - P3_EAST_X) > 2) throw new Error("fullSetup failed: " + JSON.stringify(w));
  log(`setup ok: p3x=${w.p3x}`);
}

const onTopNow = (w) => w.wg && w.wg.y >= TOP_LO && w.wg.y <= TOP_HI && w.wg.x > XLO && w.wg.x < XHI;

/** 通用试次：输入为绝对毫秒时间线 [{at, key, type:'down'|'up'}] */
async function timelineTrial(tag, x, timeline, tEnd) {
  let w = await readWorld();
  if (!w.wg || w.st !== "level" || w.lever !== 1 || Math.abs(w.p3x - P3_EAST_X) > 2 || w.paused) {
    await fullSetup();
    return { tag, x, anomaly: "guard-fail-reset" };
  }
  const stand = await tpWg(x);
  if (!stand || Math.abs(stand.y - FLOOR_CORE) > 1.2) { await fullSetup(); return { tag, x, anomaly: "settle-fail" }; }
  await sampler.drain();
  const t0 = Date.now();
  let i = 0;
  while (i < timeline.length) {
    const now = Date.now() - t0;
    if (timeline[i].at <= now) {
      try { timeline[i].type === "down" ? page.keyboard.down(timeline[i].key) : page.keyboard.up(timeline[i].key); } catch {}
      i++;
      continue;
    }
    await sleep(Math.min(timeline[i].at - now, 12));
  }
  await sleep(Math.max(tEnd - (Date.now() - t0), 0));
  for (const k of [WG.left, WG.up, WG.right]) await page.keyboard.up(k).catch(() => {});
  let landed = false;
  for (let j = 0; j < 50; j++) {
    await sleep(66);
    const s = await readWorld();
    if (!s.wg || s.st !== "level") { landed = "BROKEN"; break; }
    if (!s.wg.awake) { landed = true; break; }
  }
  await sleep(150);
  const post = await readWorld();
  const tr = await sampler.drain();
  const ws = tr.filter((s) => s.wg);
  const R = { tag, x, jumped: false, takeoffX: null, takeoffVx: null, minY: null, rise: null, restX: post.wg?.x ?? null, restY: post.wg?.y ?? null, onTop: false, onTopHold: 0, anomaly: landed === "BROKEN" ? "world-broken" : null };
  if (ws.length && !R.anomaly) {
    const y0 = ws[0].wg.y;
    let minY = 9999;
    for (const s of ws) {
      if (s.wg.vy < -100 && !R.jumped) { R.jumped = true; R.takeoffX = s.wg.x; R.takeoffVx = s.wg.vx; }
      if (s.wg.y < minY) minY = s.wg.y;
    }
    R.minY = +minY.toFixed(2);
    R.rise = +(y0 - minY).toFixed(2);
    let run = 0, best = 0;
    for (const s of ws) {
      if (s.wg.y >= TOP_LO && s.wg.y <= TOP_HI && Math.abs(s.wg.vy) < 8 && s.wg.x > XLO && s.wg.x < XHI) { run++; best = Math.max(best, run); } else run = 0;
    }
    R.onTopHold = best;
    R.onTop = onTopNow(post);
  }
  if (R.restY !== null && Math.abs(R.restY - 548) < 3 && Math.abs(R.restX - 304) < 40) {
    R.anomaly = "door-snap";
    await fullSetup();
  }
  return R;
}

await fullSetup();
await sampler.drain();

const results = [];
const run = async (R) => { results.push(R); log(`${R.tag} x=${R.x}: onTop=${R.onTop} rise=${R.rise} takeoffVx=${R.takeoffVx} rest=${R.restX},${R.restY} ${R.anomaly ?? ""}`); return R; };

// B1 时机抖动
for (const preMs of [8, 12.5, 16.7, 21, 25]) {
  for (const holdMs of [200, 267, 334, 401]) {
    const tl = [
      { at: 0, key: WG.left, type: "down" },
      { at: preMs, key: WG.up, type: "down" },
      { at: preMs + 34, key: WG.up, type: "up" },
      { at: preMs + 34 + holdMs, key: WG.left, type: "up" },
    ];
    await run(await timelineTrial(`B1-pre${preMs}-hold${holdMs}`, 790, tl, preMs + 34 + holdMs + 900));
  }
}
// B2 模式变体（x=790, hold 基准 334ms）
{
  const base = 16.7, h = 334;
  await run(await timelineTrial("B2-WfirstA-late", 790, [
    { at: 0, key: WG.up, type: "down" }, { at: 34, key: WG.up, type: "up" },
    { at: 60, key: WG.left, type: "down" }, { at: 60 + h, key: WG.left, type: "up" },
  ], 60 + h + 900));
  await run(await timelineTrial("B2-A-release-at-apex", 790, [
    { at: 0, key: WG.left, type: "down" }, { at: base, key: WG.up, type: "down" },
    { at: base + 34, key: WG.up, type: "up" }, { at: 460, key: WG.left, type: "up" },
  ], 1400));
  await run(await timelineTrial("B2-A-pulse", 790, [
    { at: 0, key: WG.left, type: "down" }, { at: base, key: WG.up, type: "down" }, { at: base + 34, key: WG.up, type: "up" },
    { at: base + 34 + 80, key: WG.left, type: "up" }, { at: base + 34 + 140, key: WG.left, type: "down" },
    { at: base + 34 + 220, key: WG.left, type: "up" }, { at: base + 34 + 280, key: WG.left, type: "down" },
  ], 1600));
  await run(await timelineTrial("B2-AD-brake", 790, [
    { at: 0, key: WG.left, type: "down" }, { at: base, key: WG.up, type: "down" }, { at: base + 34, key: WG.up, type: "up" },
    { at: base + 34 + 120, key: WG.right, type: "down" }, { at: base + 34 + 170, key: WG.right, type: "up" },
  ], 1400));
}
// B3 站位精度
for (const x of [785.5, 787, 789, 791.5, 793]) {
  const tl = [
    { at: 0, key: WG.left, type: "down" }, { at: 16.7, key: WG.up, type: "down" },
    { at: 50.7, key: WG.up, type: "up" }, { at: 384.7, key: WG.left, type: "up" },
  ];
  await run(await timelineTrial(`B3-x${x}`, x, tl, 1300));
}
// B4 阻塞区对照（记录用）
for (const x of [780, 782, 784]) for (const preF of [3, 5]) {
  const preMs = preF * F, holdMs = 40 * F;
  const tl = [
    { at: 0, key: WG.left, type: "down" }, { at: preMs, key: WG.up, type: "down" },
    { at: preMs + 34, key: WG.up, type: "up" }, { at: preMs + 34 + holdMs, key: WG.left, type: "up" },
  ];
  await run(await timelineTrial(`B4-x${x}-pre${preF}`, x, tl, preMs + 34 + holdMs + 900));
}

const valid = results.filter((r) => !r.anomaly);
const byGroup = {};
for (const r of valid) {
  const g = r.tag.split("-")[0];
  (byGroup[g] ??= { n: 0, hits: 0 });
  byGroup[g].n++;
  if (r.onTop) byGroup[g].hits++;
}
const summary = { total: results.length, valid: valid.length, onTopAny: valid.some((r) => r.onTop), byGroup, setupCount };
log("SUMMARY " + JSON.stringify(summary));
writeFileSync(join(HERE, "p5-micro.json"), JSON.stringify({ summary, results }, null, 1));
log("saved p5-micro.json");
await browser.close();

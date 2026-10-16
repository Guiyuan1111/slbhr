/**
 * p6b-singleshot：实验 C 单发会话版——每会话：openGame→enterLevel→fullSetup→单个普查点→close。
 * 背景多 tp/retry 交互下 headless oracle 出现"自发性双门胜利"僵尸态（见 05号档附注），
 * p4b 单发模式（setup→tp→jump→read）实证安全，故普查逐点单发。
 * 点集：floor896×8 / under704×4 / terrace864 毒性×2 / ledge544×2 / tween扫掠×1 / 反向tween×1 / 横穿×3。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG, FB } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p6b] ${m}`);
const FLOOR_CORE = 860.54;
const sleep = (ms) => page.waitForTimeout(ms);

let browser, page, sampler;

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

const tpWg = async (x, y0 = FLOOR_CORE) => {
  await page.evaluate(({ xx, yy }) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -yy / 32 });
  }, { x, y: y0 });
  for (let i = 0; i < 30; i++) {
    await sleep(50);
    const s = await readWorld();
    if (!s.wg) return null;
    if (!s.wg.awake || (s.wg.vy === 0 && Math.abs(s.wg.y - y0) < 0.6 && Math.abs(s.wg.x - x) < 2.5)) return s.wg;
  }
  return (await readWorld()).wg;
};

/** 逐字 p4b fullSetup（实证安全形） */
const fullSetup = async () => {
  const st = await page.evaluate(() => window.Phaser.GAMES[0].state.current);
  if (st === "level") await page.evaluate(() => { window.Phaser.GAMES[0].level.retry(); });
  else throw new Error("not level at session start");
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    return g.state.current === "level" && !!g.level?.pers1 && !!g.level?.pers2 && g.level.levelStarted;
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
  if (!(w.wg && w.lever === 1 && Math.abs((w.p3x ?? 0) - 700.26) <= 2)) throw new Error("fullSetup verify fail: " + JSON.stringify(w));
};

const analyze = (y0, tr, opt = {}) => {
  const ws = tr.filter((s) => s.wg);
  if (!ws.length) return { empty: true };
  let minY = 9999, jumped = false, takeoffX = null, takeoffVx = null, passThrough = false, minVy = 0;
  const xLo = opt.xLo ?? 632, xHi = opt.xHi ?? 768, yThr = opt.yThr ?? 827;
  for (const s of ws) {
    if (s.wg.vy < -100 && !jumped) { jumped = true; takeoffX = s.wg.x; takeoffVx = s.wg.vx; }
    if (s.wg.y < minY) minY = s.wg.y;
    if (s.wg.y < yThr && s.wg.x > xLo && s.wg.x < xHi) passThrough = true;
    if (s.wg.vy < minVy) minVy = s.wg.vy;
  }
  return { jumped, takeoffX, takeoffVx: +takeoffVx?.toFixed(1), minY: +minY.toFixed(2), rise: +(y0 - minY).toFixed(2), passThrough, minVy: +minVy.toFixed(1) };
};

/** 单会话执行一个任务 */
async function singleShot(task) {
  ({ browser, page } = await openGame());
  await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
  await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
  await page.waitForTimeout(4000);
  sampler = await attachSampler(page);
  try {
    await fullSetup();
    await sampler.drain();
    const r = await task();
    log(`${task.tag}: ${JSON.stringify(r).slice(0, 220)}`);
    return r;
  } catch (e) {
    const w = await readWorld().catch(() => null);
    const winInfo = await page.evaluate(() => window.__o05aWin || null).catch(() => null);
    log(`${task.tag}: TASK FAIL ${String(e).slice(0, 110)} world=${JSON.stringify(w)} win=${JSON.stringify(winInfo)}`);
    return { tag: task.tag, fail: String(e).slice(0, 160), world: w, winInfo };
  } finally {
    try { await browser.close(); } catch {}
  }
}

// 任务定义
const jumpAt = (x, y0 = FLOOR_CORE, hold = 35, opt = {}) => async () => {
  const stand = await tpWg(x, y0);
  if (!stand) throw new Error("tp settle fail");
  const tr = await sampler.drain();
  await page.keyboard.down(WG.up);
  await sleep(hold);
  await page.keyboard.up(WG.up);
  await sleep(1600);
  const w = await readWorld();
  if (!w.wg || w.st !== "level") throw new Error("post-jump broken");
  const tr2 = await sampler.drain();
  return { tag: `jump@${x}`, standY: +stand.y.toFixed(2), ...analyze(y0, tr.concat(tr2), opt) };
};

const tweenSweep = async () => {
  const stand = await tpWg(700);
  if (!stand) throw new Error("tp settle fail");
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers1.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -470 / 32, y: -668.8 / 32 });
  });
  await sleep(500);
  await sampler.drain();
  await page.keyboard.down(FB.left);
  await sleep(450);
  await page.keyboard.down(WG.up);
  await sleep(40);
  await page.keyboard.up(WG.up);
  await sleep(850);
  await page.keyboard.down(WG.up);
  await sleep(40);
  await page.keyboard.up(WG.up);
  await sleep(700);
  await page.keyboard.up(FB.left).catch(() => {});
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    const p3 = g.MechManager.deviceGroups[3]?.find((d) => d.options?.type === "platform");
    if (!p3) return false;
    return Math.abs(-32 * p3.body.data.GetLinearVelocity().x) < 0.5;
  }, { timeout: 10000 });
  await sleep(600);
  const tr = await sampler.drain();
  const w = await readWorld();
  return { tag: "tweenSweep", ...analyze(FLOOR_CORE, tr), finalLever: w.lever, finalP3x: w.p3x };
};

const crossRun = (startX, key, tag) => async () => {
  const stand = await tpWg(startX);
  if (!stand) throw new Error("tp settle fail");
  await sampler.drain();
  await page.keyboard.down(key);
  let t = 0;
  while (t < 600) {
    const s = await readWorld();
    if (!s.wg || s.st !== "level") break;
    if (Math.abs(s.wg.vx) > 240) break;
    await sleep(20); t += 20;
  }
  await page.keyboard.down(WG.up);
  await sleep(40);
  await page.keyboard.up(WG.up);
  await sleep(1400);
  await page.keyboard.up(key).catch(() => {});
  await sleep(500);
  const tr = await sampler.drain();
  const w = await readWorld();
  if (!w.wg || w.st !== "level") throw new Error("post-cross broken");
  return { tag, ...analyze(FLOOR_CORE, tr) };
};

const tasks = [
  tweenSweep,
  ...[660, 680, 700, 720, 740, 760, 780, 800, 820, 845].map((x) => jumpAt(x)),
  ...[780, 800, 820, 840].map((x) => jumpAt(x, FLOOR_CORE, 35, { yThr: 745 })), // under704（台底 736，头圆阈 736+21.76≈757.8 → 以 yThr 745 查穿透）
  jumpAt(910, 828.8, 35, { yThr: 840 }), // terrace 毒性+站位（tile6）
  jumpAt(1000, 828.8, 35, { yThr: 840 }),
  jumpAt(910, 508.8, 35, { yThr: 700 }), // ledge544
  jumpAt(1000, 508.8, 35, { yThr: 700 }),
  crossRun(795, WG.left, "westRun"),
  crossRun(795, WG.left, "westRun#2"),
  crossRun(648, WG.right, "eastRun"),
];

const results = [];
for (let i = 0; i < tasks.length; i++) {
  const task = tasks[i];
  task.tag = task.tag ?? `task${i}`;
  let r = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    r = await singleShot(task);
    if (!r.fail) break;
    log(`${task.tag} attempt ${attempt} failed, ${attempt < 2 ? "retrying" : "giving up"}`);
  }
  results.push(r);
  writeFileSync(join(HERE, "p6b-singleshot.json"), JSON.stringify(results, null, 1));
}
log(`DONE ${results.filter((r) => !r.fail).length}/${results.length} tasks ok`);
process.exit(0);

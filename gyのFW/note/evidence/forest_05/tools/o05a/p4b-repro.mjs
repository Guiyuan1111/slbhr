/**
 * p4b-repro：HIT 复现 + 命中窗口初探 + 落顶状态三重验证（接触体=P3 / 站立稳固 / 复跳回顶）。
 * 窗口：x∈{788,790,792,794}×pre1f×hold{12,20,28,40} + x=790 精调 + HIT 组合×5 重复。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG, FB } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4b] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);
const F = 16.7;
const FLOOR_CORE = 860.54;
const P3_EAST_X = 700.26;

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

const wgTouchesP3 = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const grp = g.MechManager.deviceGroups[3];
    const p3dev = grp.find((d) => d.options?.type === "platform");
    const p3body = p3dev.body.data;
    const wb = g.level.pers2.body.data;
    let ce = wb.GetContactList ? wb.GetContactList() : wb.m_contactList;
    const found = [];
    let n = 0;
    while (ce && n < 12) {
      if (ce.other === p3body) found.push({ touching: ce.contact ? ce.contact.IsTouching() : null });
      ce = ce.next; n++;
    }
    return { contactsOnP3: found.length, anyTouching: found.some((f) => f.touching), total: n };
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

const TOP_LO = 758, TOP_HI = 779, XLO = 632, XHI = 768;
const onTopNow = (w) => w.wg && w.wg.y >= TOP_LO && w.wg.y <= TOP_HI && w.wg.x > XLO && w.wg.x < XHI;

/** 一次弹幕跳 + 落顶判定 + （命中时）接触/稳固/复跳验证 */
async function slotJump(x, preMs, holdMs) {
  let w = await readWorld();
  if (!w.wg || w.st !== "level" || w.lever !== 1 || Math.abs(w.p3x - P3_EAST_X) > 2 || w.paused) {
    await fullSetup();
    return { anomaly: "guard-fail-reset" };
  }
  const stand = await tpWg(x);
  if (!stand || Math.abs(stand.y - FLOOR_CORE) > 1.2) { await fullSetup(); return { anomaly: "settle-fail" }; }
  await sampler.drain();
  await page.keyboard.down(WG.left);
  await sleep(preMs);
  await page.keyboard.down(WG.up);
  await sleep(34);
  await page.keyboard.up(WG.up);
  await sleep(holdMs);
  await page.keyboard.up(WG.left);
  let landed = false;
  for (let i = 0; i < 60; i++) {
    await sleep(66);
    const s = await readWorld();
    if (!s.wg || s.st !== "level") { landed = "BROKEN"; break; }
    if (!s.wg.awake) { landed = true; break; }
  }
  await sleep(150);
  const post = await readWorld();
  const tr = await sampler.drain();
  const ws = tr.filter((s) => s.wg);
  const R = { x, preMs, holdMs, jumped: false, takeoffX: null, takeoffVx: null, minY: null, rise: null, restX: post.wg?.x ?? null, restY: post.wg?.y ?? null, onTop: false, onTopHold: 0, anomaly: landed === "BROKEN" ? "world-broken" : null };
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
  if (R.onTop) {
    // 三重验证
    const contact = await wgTouchesP3();
    await sleep(1500);
    const stable = await readWorld();
    const stableOk = onTopNow(stable);
    // 复跳：W 轻点 → 应落回顶
    await page.keyboard.down(WG.up);
    await sleep(34);
    await page.keyboard.up(WG.up);
    await sleep(2000);
    const rej = await readWorld();
    const rejumpOk = onTopNow(rej);
    R.verify = { contact, stableOk, stablePos: [stable.wg?.x, stable.wg?.y], rejumpOk, rejumpPos: [rej.wg?.x, rej.wg?.y] };
  }
  return R;
}

await fullSetup();
await sampler.drain();

const results = [];
let hitCount = 0, bestTrace = null;
const run = async (x, preF, holdF, tag) => {
  const R = await slotJump(x, Math.max(preF * F, 8), holdF * F);
  R.tag = tag;
  results.push(R);
  if (R.onTop) hitCount++;
  log(`${tag} x=${x} pre=${preF}f hold=${holdF}f → onTop=${R.onTop} rise=${R.rise} rest=${R.restX},${R.restY}${R.onTop ? " " + JSON.stringify(R.verify) : ""}${R.anomaly ? " " + R.anomaly : ""}`);
  if (R.onTop && R.verify?.contact?.anyTouching && R.verify?.stableOk && R.verify?.rejumpOk && !bestTrace) {
    // 保留一份全胜验证组合的完整采样
    bestTrace = R;
  }
  return R;
};

// 窗口初探
for (const x of [788, 790, 792, 794]) for (const hold of [12, 20, 28, 40]) await run(x, 1, hold, "win");
// 精调
await run(790, 0.5, 20, "fine");
await run(790, 2, 20, "fine");
await run(786, 1, 20, "fine");
// HIT 组合重复 ×5
for (let i = 1; i <= 5; i++) await run(790, 1, 20, `rep${i}`);

const summary = { total: results.length, hits: hitCount, setupCount };
log("SUMMARY " + JSON.stringify(summary));
writeFileSync(join(HERE, "p4b-repro.json"), JSON.stringify({ summary, results }, null, 1));
log("saved p4b-repro.json");
if (bestTrace) {
  // 截屏留证（wg 站顶状态）
  await page.screenshot({ path: join(HERE, "p4b-hit-top.png") }).catch(() => {});
  log("screenshot saved");
}
await browser.close();

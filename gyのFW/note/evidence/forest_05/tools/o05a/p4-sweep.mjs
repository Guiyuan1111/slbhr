/**
 * p4-sweep：实验 A（核心）——r05f W3 弹幕扫参的 oracle 实机复刻。
 * wg 从 x∈[660,790](步10) × creep 预压 {1,3,5,8,11}f × 空中保持{0,8,20,40}f，共 260 组。
 * 前提：杆2 真实翻转（fb teleport 上西704台→真实左行触杆）→ P3 驻东 [632.26,768.26] 带 [803.92,832.08]。
 * 判据（内核 04号档 §2(a) 对齐）：登上 P3 东顶 = grounded 驻留 core y∈[758,779] & x∈(632,768)（standing core≈768.7）。
 * HIT 即 ORACLE_SOLVED 级证据：立刻停机并全量落盘（输入序列+逐帧采样）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG, FB } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);
const F = 16.7; // 1 kernel frame @60fps

const X_LIST = []; for (let x = 660; x <= 790; x += 10) X_LIST.push(x);
const PRE_LIST = [1, 3, 5, 8, 11];
const HOLD_LIST = [0, 8, 20, 40];
const P3_EAST_X = 700.26;
const FLOOR_CORE = 860.54;
const TOP_CORE_LO = 758, TOP_CORE_HI = 779, TOP_X_LO = 632, TOP_X_HI = 768;

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
    return {
      st: g.state.current, wg: grab(lv?.pers2), fb: grab(lv?.pers1),
      lever: lever ? lever.state : null, p3x: pp ? +px(pp.x).toFixed(2) : null, paused: g.physics.box2d.paused,
    };
  });

const tpWg = async (x) => {
  await page.evaluate((xx) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -860.54 / 32 });
  }, x);
  // 等入睡或稳定驻停（最多 1.6s）
  for (let i = 0; i < 32; i++) {
    await sleep(50);
    const s = await readWorld();
    if (!s.wg) return null;
    if (!s.wg.awake || (s.wg.vy === 0 && Math.abs(s.wg.y - FLOOR_CORE) < 0.5 && Math.abs(s.wg.x - x) < 2)) return s.wg;
  }
  return (await readWorld()).wg;
};

/** 完整重建：重进关卡→翻杆2→fb 停靠右ledge(1010,508.8) */
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
  // fb → 西704台
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
  await sleep(300); // 走离杆
  await page.keyboard.up(FB.left).catch(() => {});
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
    const v = p3.body.data.GetLinearVelocity();
    return Math.abs(-32 * v.x) < 0.5 && -32 * p3.body.data.GetPosition().x > 690;
  }, { timeout: 8000 });
  // fb 停靠右 ledge
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
  log(`setup ok: p3x=${w.p3x} lever=${w.lever}`);
}

// ---- 主流程 ----
await fullSetup();
await sampler.drain();

const trials = [];
const anomalies = [];
let hit = null, done = 0, setupFails = 0;

outer: for (const x of X_LIST) {
  for (const pre of PRE_LIST) {
    for (const hold of HOLD_LIST) {
      // 守卫
      let w = await readWorld();
      if (!w.wg || w.st !== "level" || w.lever !== 1 || Math.abs(w.p3x - P3_EAST_X) > 2 || w.paused) {
        anomalies.push({ at: `${x}/${pre}/${hold}`, why: "guard-fail", world: w });
        log(`GUARD FAIL at ${x}/${pre}/${hold}: ${JSON.stringify(w)}`);
        await fullSetup();
        setupFails++;
      }
      const stand = await tpWg(x);
      if (!stand || Math.abs(stand.y - FLOOR_CORE) > 1.2 || Math.abs(stand.x - x) > 3) {
        anomalies.push({ at: `${x}/${pre}/${hold}`, why: "settle-fail", stand });
        log(`SETTLE FAIL at ${x}/${pre}/${hold}: ${JSON.stringify(stand)}`);
        await fullSetup();
        setupFails++;
        continue;
      }
      await sampler.drain();
      // 真实键盘弹幕：A 预压 pre f → +W 跳(34ms) → 空中 A 保持 hold f → 全放
      await page.keyboard.down(WG.left);
      await sleep(pre * F);
      await page.keyboard.down(WG.up);
      await sleep(34);
      await page.keyboard.up(WG.up);
      await sleep(Math.max(hold * F, 1));
      await page.keyboard.up(WG.left);
      // 等落地静止（入睡）或 4s 超时
      let landed = false;
      for (let i = 0; i < 60; i++) {
        await sleep(66);
        const s = await readWorld();
        if (!s.wg || s.st !== "level") { landed = "BROKEN"; break; }
        if (!s.wg.awake) { landed = true; break; }
      }
      await sleep(120);
      const post = await readWorld();
      const tr = await sampler.drain();
      const ws = tr.filter((s) => s.wg);
      const R = { x, pre, hold, jumped: false, takeoffX: null, takeoffVx: null, p3x: post.p3x, minY: null, rise: null, restX: post.wg?.x ?? null, restY: post.wg?.y ?? null, onTop: false, onTopHold: 0, anomaly: null };
      if (landed === "BROKEN" || !post.wg) {
        R.anomaly = "world-broken";
        anomalies.push({ at: `${x}/${pre}/${hold}`, why: "world-broken", post });
        trials.push(R);
        log(`WORLD BROKEN at ${x}/${pre}/${hold}`);
        await fullSetup();
        setupFails++;
        continue;
      }
      if (ws.length) {
        const y0 = ws[0].wg.y;
        R.y0 = y0;
        let minY = 9999, jumpIdx = -1;
        for (let i = 0; i < ws.length; i++) {
          if (ws[i].wg.vy < -100 && !R.jumped) { R.jumped = true; jumpIdx = i; R.takeoffX = ws[i].wg.x; R.takeoffVx = ws[i].wg.vx; }
          if (ws[i].wg.y < minY) minY = ws[i].wg.y;
        }
        R.minY = +minY.toFixed(2);
        R.rise = +(y0 - minY).toFixed(2);
        // 登顶判据：驻留（≥15 连续采样 ~250ms）y∈[758,779] & |vy|<8 & x∈(632,768)
        let run = 0, best = 0;
        for (const s of ws) {
          if (s.wg.y >= TOP_CORE_LO && s.wg.y <= TOP_CORE_HI && Math.abs(s.wg.vy) < 8 && s.wg.x > TOP_X_LO && s.wg.x < TOP_X_HI) { run++; best = Math.max(best, run); }
          else run = 0;
        }
        R.onTopHold = best;
        R.onTop = best >= 15 || (post.wg.y >= TOP_CORE_LO && post.wg.y <= TOP_CORE_HI && post.wg.x > TOP_X_LO && post.wg.x < TOP_X_HI && !post.wg.awake);
      }
      if (R.restY !== null && Math.abs(R.restY - 548) < 3 && Math.abs(R.restX - 304) < 40) {
        R.anomaly = "door-snap"; // wg 被吸到 door2 (304,548) —— 已知低频毛刺
        anomalies.push({ at: `${x}/${pre}/${hold}`, why: "door-snap", rest: [R.restX, R.restY] });
        log(`DOOR-SNAP glitch at ${x}/${pre}/${hold}, rest=${R.restX},${R.restY} → full re-setup`);
        trials.push(R);
        await fullSetup();
        setupFails++;
        continue;
      }
      trials.push(R);
      done++;
      if (R.onTop) { hit = R; log(`*** HIT: onTop at x=${x} pre=${pre} hold=${hold} rise=${R.rise} rest=${R.restX},${R.restY} ***`); }
      if (done % 20 === 0) {
        const rises = trials.filter((t) => t.rise != null).map((t) => t.rise);
        log(`progress ${done}/260 maxRise=${Math.max(...rises).toFixed(1)} setupFails=${setupFails} anomalies=${anomalies.length}`);
      }
      if (hit) {
        // HIT：全量留证后停机
        const fullTrace = tr;
        writeFileSync(join(HERE, "p4-HIT.json"), JSON.stringify({ hit, fullTrace }, null, 1));
        break outer;
      }
    }
  }
}

const valid = trials.filter((t) => !t.anomaly && t.rise != null);
const rises = valid.map((t) => t.rise).sort((a, b) => a - b);
const byX = {};
for (const x of X_LIST) {
  const rs = valid.filter((t) => t.x === x).map((t) => t.rise);
  byX[x] = { n: rs.length, min: Math.min(...rs) ?? null, max: Math.max(...rs) ?? null };
}
const maxRise = rises.length ? rises[rises.length - 1] : null;
const summary = {
  total: trials.length, valid: valid.length, hits: hit ? 1 : 0,
  jumped: valid.filter((t) => t.jumped).length,
  maxRise, riseMedian: rises.length ? rises[Math.floor(rises.length / 2)] : null,
  onTopAny: valid.some((t) => t.onTop),
  setupCount, setupFails, anomalies: anomalies.length,
  anomalyKinds: anomalies.reduce((a, e) => ((a[e.why] = (a[e.why] ?? 0) + 1), a), {}),
};
log("SUMMARY " + JSON.stringify(summary));
log("byX " + JSON.stringify(byX));
writeFileSync(join(HERE, "p4-sweep.json"), JSON.stringify({ summary, byX, trials, anomalies }, null, 1));
log("saved p4-sweep.json");
await browser.close();

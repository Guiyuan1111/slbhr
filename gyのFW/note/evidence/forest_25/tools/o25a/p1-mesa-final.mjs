/**
 * p1-mesa v3：实验 A 终版——oracle 实机 mesa 风洞东征 ×30 采样（3 策略 ×10）。
 *
 * 策略：
 *   spam  — D 保持 + W 连打（50/60ms），复刻 r25d p56 的 oracle 适配形；
 *   run   — 纯地面跑（D 保持零跳），run 50N vs 风时均 ~120*f(x) N，解析极限 ~955-992；
 *   phase — 纯跑，但每当 wind sin 相位接近谷底（力乘子 1.2+0.2sin 最小）时补一次跳，
 *           试图借最小风阻窗口推进。
 * 共同前段：A 西行跌落 → 水架 [640,736] 浮起 → D+W 爬双阶 [736,768]@288/[768,800]@256 上 mesa 顶。
 * 判定：任意采样 x≥1056 → GAP_REACHED（即告 ORACLE_SOLVED 级证据）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PER = { run: 15, phase: 10, spam: 5 };
const BATTLE_MS = Number(process.argv[3] ?? 25000);
const THRESH = 1056;
const log = (m) => console.log(`[p1] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForTimeout(5000); // 装饰 tween 定时器窗排空（2-4s），retry 安全
const sampler = await attachSampler(page);
log("in, sampler attached");

const sleep = (ms) => page.waitForTimeout(ms);
const wgState = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const p = g.level?.pers2;
    if (!p || !p.body) return null;
    const r = p.body.data.GetPosition();
    const v = p.body.data.GetLinearVelocity();
    return { x: -32 * r.x, y: -32 * r.y, vx: -32 * v.x, vy: -32 * v.y, st: g.state.current, now: g.time.now };
  });

async function reset() {
  const st = await page.evaluate(() => window.Phaser.GAMES[0].state.current);
  if (st === "level") await page.evaluate(() => { window.Phaser.GAMES[0].level.retry(); });
  else await page.evaluate(() => { window.Phaser.GAMES[0].state.states.menu.skipToLevel(window.Phaser.GAMES[0].level?.levelData ?? { id: 25, filename: "forest/levels/forest_25.json", required: 0, _id: 29, type: "general" }); });
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    if (g.state.current !== "level" || !g.level?.pers2 || !g.level.levelStarted) return false;
    const r = g.level.pers2.body.data.GetPosition();
    return -32 * r.x > 1100 && -32 * r.y < 120;
  }, { timeout: 20000 });
  await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
  await sleep(150);
}

/** 共同前段：西行跌落→水架→爬梯上 mesa 顶（返回登陆点信息；失败返回 null）。 */
async function approach() {
  await page.keyboard.down(WG.left);
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const s = await wgState();
    if (!s || s.st !== "level") { await page.keyboard.up(WG.left); return null; }
    if (s.y > 255 && Math.abs(s.vy) < 25) break;
    await sleep(25);
  }
  await page.keyboard.up(WG.left);
  const s1 = await wgState();
  if (!s1 || s1.st !== "level" || s1.y < 200) return null;
  // 爬梯：D 保持 + W 连打直至 x>800 且 y<270（mesa 顶站位带）
  await page.keyboard.down(WG.right);
  const t1 = Date.now();
  let onMesa = false;
  while (Date.now() - t1 < 6000) {
    await page.keyboard.down(WG.up);
    await sleep(45);
    await page.keyboard.up(WG.up);
    await sleep(55);
    const s = await wgState();
    if (!s || s.st !== "level") break;
    if (s.x > 805 && s.y > 200 && s.y < 268 && Math.abs(s.vy) < 30) { onMesa = true; break; }
  }
  if (!onMesa) { await page.keyboard.up(WG.right); return null; }
  const s2 = await wgState();
  return { x: s2.x, y: s2.y, now: s2.now };
}

const results = [];
let best = null;
let solved = null;

const POLICIES = ["run", "phase", "spam"];
outer: for (const policy of POLICIES) {
  for (let k = 1; k <= PER[policy]; k++) {
    const run = `${policy}-${k}`;
    await reset();
    await sampler.drain();
    const R = { run, policy, land: null, mesaAt: null, max_x: 0, outcome: null, tEnd: null };
    const ap = await approach();
    if (!ap) {
      R.outcome = "APPROACH_FAIL";
      results.push(R);
      log(`${run}: APPROACH_FAIL`);
      continue;
    }
    R.mesaAt = +ap.x.toFixed(1);
    await sampler.drain(); // 丢弃前段样本，max_x 只计战斗窗
    const t0 = Date.now();
    let stopped = false;
    const samplesRef = { cur: [] };
    const stop = async (why) => {
      if (stopped) return;
      stopped = true;
      R.outcome = why;
      R.tEnd = Date.now() - t0;
      await page.keyboard.up(WG.right).catch(() => {});
      await page.keyboard.up(WG.up).catch(() => {});
      const post = await sampler.drain().catch(() => []);
      const all = samplesRef.cur.concat(post);
      for (const s of all) if (s.wg && s.wg.x > R.max_x) R.max_x = s.wg.x;
      R.max_x = +R.max_x.toFixed(1);
      results.push(R);
      if (!best || R.max_x > best.max_x) best = { run: R.run, max_x: R.max_x, mesaAt: R.mesaAt, samples: all.filter((_, i) => i % 3 === 0) };
      log(`${run}: ${why} mesa=${R.mesaAt} max_x=${R.max_x}`);
    };
    const watcher = (async () => {
      while (!stopped) {
        const s = await wgState().catch(() => null);
        if (!s) { await sleep(30); continue; }
        if (s.st !== "level") return stop("STATE_EXIT");
        if (s.x >= THRESH) return stop("GAP_REACHED");
        if (Date.now() - t0 > BATTLE_MS) return stop("TIMEOUT");
        await sleep(20);
      }
    })();
    if (policy === "spam") {
      await page.keyboard.down(WG.right);
      (async () => { samplesRef.cur = await sampler.drain().catch(() => []); })();
      while (!stopped) {
        await page.keyboard.down(WG.up);
        await sleep(50);
        await page.keyboard.up(WG.up);
        await sleep(60);
      }
    } else if (policy === "run") {
      await page.keyboard.down(WG.right);
      samplesRef.cur = await sampler.drain().catch(() => []);
      while (!stopped) await sleep(60);
    } else {
      // phase：timed-launch 纯跑——先原地按 D 顶住（x~805 风弱区），等 sin 相位进入 [3.3,4.5]（逼近谷底）即全力东跑
      await page.keyboard.down(WG.right);
      samplesRef.cur = await sampler.drain().catch(() => []);
      let launched = false;
      while (!stopped) {
        const s = await wgState();
        if (!s) { await sleep(40); continue; }
        if (!launched) {
          const phase = (s.now / 1000) % (2 * Math.PI);
          if (phase > 3.3 && phase < 4.5) launched = true;
          await sleep(60);
          continue;
        }
        await sleep(60);
      }
    }
    await watcher;
    if (R.outcome === "GAP_REACHED") { solved = R; break outer; }
  }
}

const maxes = results.map((r) => r.max_x).filter((v) => v > 0).sort((a, b) => a - b);
const byPolicy = {};
for (const p of POLICIES) {
  const m = results.filter((r) => r.policy === p).map((r) => r.max_x).filter((v) => v > 0).sort((a, b) => a - b);
  byPolicy[p] = { n: m.length, min: m[0] ?? null, median: m.length ? m[Math.floor(m.length / 2)] : null, max: m[m.length - 1] ?? null, all: m };
}
const summary = {
  threshold: THRESH,
  solved: !!solved,
  N: results.length,
  overall: { min: maxes[0] ?? null, median: maxes.length ? maxes[Math.floor(maxes.length / 2)] : null, max: maxes[maxes.length - 1] ?? null },
  byPolicy,
  outcomes: results.reduce((a, r) => ((a[r.outcome] = (a[r.outcome] ?? 0) + 1), a), {}),
  battle_ms: BATTLE_MS,
};
writeFileSync(join(HERE, "p1-mesa-final.json"), JSON.stringify({ summary, results, best, solved }, null, 1));
log(`SUMMARY ${JSON.stringify(summary, null, 1)}`);
await browser.close();

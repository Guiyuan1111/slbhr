/** p3d-repro：x=700 rise=118.9 异常复现检验（净环境 + 污染环境对照）+ 修正站位常数的 terrace 站立检验。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p3d] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(1500);
const sampler = await attachSampler(page);

/** teleport 并等站稳；y0 由调用方给定（不同地形不同站立核心高） */
async function tpWg(x, y0) {
  await page.evaluate(({ xx, yy }) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -yy / 32 });
  }, { x, y: y0 });
  for (let i = 0; i < 25; i++) {
    await sleep(40);
    const s = await page.evaluate(() => {
      const g = window.Phaser.GAMES[0];
      const d = g.level.pers2.body.data, p = d.GetPosition(), v = d.GetLinearVelocity();
      return { x: -32 * p.x, y: -32 * p.y, vy: -32 * v.y, awake: d.IsAwake() };
    });
    if (!s.awake || (s.vy === 0 && Math.abs(s.y - y0) < 0.8 && Math.abs(s.x - x) < 3)) return s;
  }
  const s = await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data, p = d.GetPosition(), v = d.GetLinearVelocity();
    return { x: -32 * p.x, y: -32 * p.y, vy: -32 * v.y, awake: d.IsAwake() };
  });
  log(`  [warn] tp(${x},${y0}) settle-unconfirmed: ${JSON.stringify(s)}`);
  return s;
}

/** 一次 W 跳（holdMs 毫秒），采样全程，返回 rise/vy0/minY/轨迹摘要 */
async function oneJump(holdMs) {
  await sampler.drain();
  await page.keyboard.down(WG.up);
  await sleep(holdMs);
  await page.keyboard.up(WG.up);
  await sleep(1600);
  const tr = await sampler.drain();
  const w = tr.filter((s) => s.wg);
  if (!w.length) return { err: "no samples" };
  let minY = 9999, vy0 = 0, jumped = false;
  for (const s of w) {
    if (s.wg.vy < -60 && !jumped) { jumped = true; vy0 = s.wg.vy; }
    if (s.wg.y < minY) minY = s.wg.y;
  }
  return { jumped, vy0: +vy0.toFixed(1), minY: +minY.toFixed(2), rise: +(w[0].wg.y - minY).toFixed(2), fromY: w[0].wg.y, restY: w[w.length - 1].wg.y };
}

const results = [];
const trial = async (label, x, y0, hold = 35) => {
  const st = await tpWg(x, y0);
  const r = await oneJump(hold);
  results.push({ label, x, y0, standY: +st.y.toFixed(2), hold, ...r });
  log(`${label} x=${x} y0=${y0}: stand=${st.y.toFixed(2)} jumped=${r.jumped} vy0=${r.vy0} minY=${r.minY} rise=${r.rise} rest=${r.restY}`);
};

// 净环境复现：700 ×5
for (let i = 1; i <= 5; i++) await trial(`clean700#${i}`, 700, 860.54);
// 对照 800
await trial("clean800", 800, 860.54);
// 墙脚 845
await trial("wallfoot845", 845, 860.54);
// terrace 1000（修正站立核心 864−35.2=828.8）
await trial("terrace1000", 1000, 828.8);
await trial("terrace1000b", 1000, 828.8);
// 污染复现：先制造嵌入再回 700
await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const d = g.level.pers2.body.data;
  d.SetAwake(true);
  d.SetLinearVelocity({ x: 0, y: 0 });
  d.SetPosition({ x: -1000 / 32, y: -860.54 / 32 }); // 嵌入 b30
});
await sleep(500);
const emb = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const d = g.level.pers2.body.data, p = d.GetPosition();
  return { x: -32 * p.x, y: -32 * p.y };
});
log(`embedded state: ${JSON.stringify(emb)}`);
for (let i = 1; i <= 3; i++) await trial(`contam800#${i}`, 800, 860.54);
for (let i = 1; i <= 3; i++) await trial(`contam700#${i}`, 700, 860.54);

writeFileSync(join(HERE, "p3d-repro.json"), JSON.stringify({ embedded: emb, results }, null, 1));
log("saved p3d-repro.json");
await browser.close();

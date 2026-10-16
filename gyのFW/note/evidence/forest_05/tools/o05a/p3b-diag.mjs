/** p3b-diag：W 按压时长 vs 跳触发诊断 + x=1000 站位异常(859.09)溯源。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p3b] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(1500);
const sampler = await attachSampler(page);

const tpWg = async (x) => {
  await page.evaluate((xx) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -860.54 / 32 });
  }, x);
  await sleep(600);
  const s = await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data, p = d.GetPosition(), v = d.GetLinearVelocity();
    return { x: -32 * p.x, y: -32 * p.y, vy: -32 * v.y, awake: d.IsAwake() };
  });
  log(`tp(${x}) -> ${JSON.stringify(s)}`);
  return s;
};

const trials = [];
for (const [x, hold] of [[1000, 16], [1000, 35], [1000, 100], [800, 16], [800, 35], [700, 35]]) {
  await tpWg(x);
  await sampler.drain();
  await page.keyboard.down(WG.up);
  await sleep(hold);
  await page.keyboard.up(WG.up);
  await sleep(1600);
  const tr = await sampler.drain();
  const ys = tr.filter((s) => s.wg).map((s) => s.wg.y);
  const vys = tr.filter((s) => s.wg).map((s) => s.wg.vy);
  const minVy = Math.min(...vys), minY = Math.min(...ys);
  const restY = ys[ys.length - 1];
  trials.push({ x, hold, n: tr.length, minVy: +minVy.toFixed(1), minY: +minY.toFixed(2), rise: +(860.54 - minY).toFixed(2), restY: +restY.toFixed(2) });
  log(`x=${x} hold=${hold}: minVy=${minVy.toFixed(1)} minY=${minY.toFixed(2)} rise=${(860.54 - minY).toFixed(2)} restY=${restY.toFixed(2)} n=${tr.length}`);
  if (x === 1000 && hold === 16) {
    log("trace[0..25]: " + JSON.stringify(tr.slice(0, 25).map((s) => [s.t, s.wg?.y, s.wg?.vy])));
  }
}
writeFileSync(join(HERE, "p3b-diag.json"), JSON.stringify(trials, null, 1));
await browser.close();

/** p3e-debug：定位 wg→door2(304,548) snap 时机。对照：不 tp 纯观察 vs tp(700)。 */
import { openGame, enterLevel, attachSampler } from "./lib.mjs";

const log = (m) => console.log(`[p3e] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(1500);
const sampler = await attachSampler(page);

const probe = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    if (!lv || !lv.pers2 || !lv.pers2.body || !lv.pers2.body.data) return { alive: false, st: g.state.current };
    const d = lv.pers2.body.data;
    const p = d.GetPosition();
    return {
      alive: true,
      st: g.state.current,
      x: p ? +(-32 * p.x).toFixed(1) : null,
      y: p ? +(-32 * p.y).toFixed(1) : null,
      ended: !!lv.ended,
      d1up: !!lv.door1?.isUp,
      d2up: !!lv.door2?.isUp,
      d1open: !!lv.door1?.isOpen,
      d2open: !!lv.door2?.isOpen,
    };
  });

// 段1：不 tp，纯观察 3s
log("phase1: observe only");
for (let i = 0; i < 6; i++) { await sleep(500); log(`  t+${(i + 1) * 0.5}s ` + JSON.stringify(await probe())); }

// 段2：tp(700) 后观察
log("phase2: tp(700,860.54)");
await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const d = g.level.pers2.body.data;
  d.SetAwake(true);
  d.SetLinearVelocity({ x: 0, y: 0 });
  d.SetPosition({ x: -700 / 32, y: -860.54 / 32 });
  window.__tpAt = performance.now();
});
for (let i = 0; i < 12; i++) { await sleep(250); log(`  tp+${((i + 1) * 0.25).toFixed(2)}s ` + JSON.stringify(await probe())); }

// 段3：采样轨迹排空（若有）
const tr = await sampler.drain();
log("samples n=" + tr.length + " first3=" + JSON.stringify(tr.slice(0, 3).map((s) => [s.t, s.wg?.x, s.wg?.y])) + " last3=" + JSON.stringify(tr.slice(-3).map((s) => [s.t, s.wg?.x, s.wg?.y])));
await browser.close();

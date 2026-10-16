/** p1-leverflip：fb teleport 上西704台(704) → 真实左行触杆2 → 实测翻转+P3东移 tween 全程。
 * 佐证目的：为 wg 扫参提供"P3 驻东"前提（真实机关链，仅 fb 位置辅助 teleport，披露）。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p1] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(1500);
const sampler = await attachSampler(page);

// P3 形状 API 普查（顶点/AABB）
const shapeApi = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
  const f = p3.body.data.GetFixtureList();
  const s = f.GetShape();
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(s));
  const out = { shapeProto: proto };
  try { const bb = f.GetAABB ? f.GetAABB() : null; if (bb) out.aabb = { lo: [-32 * bb.lowerBound.x, -32 * bb.lowerBound.y], hi: [-32 * bb.upperBound.x, -32 * bb.upperBound.y] }; } catch (e) { out.aabbErr = String(e).slice(0, 120); }
  try { out.m_vertices = s.m_vertices ? s.m_vertices.map((v) => [-32 * v.x, -32 * v.y]) : null; } catch (e) { out.mvErr = String(e).slice(0, 120); }
  try { out.m_centroid = s.m_centroid ? [-32 * s.m_centroid.x, -32 * s.m_centroid.y] : null; } catch {}
  return out;
});
log("shapeApi: " + JSON.stringify(shapeApi));

// teleport fb 到西704台 (470, 668.8)
const tp = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const d = g.level.pers1.body.data;
  d.SetLinearVelocity({ x: 0, y: 0 });
  d.SetPosition({ x: -470 / 32, y: -668.8 / 32 });
  return true;
});
await page.waitForTimeout(700);
const fbCheck = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const d = g.level.pers1.body.data, p = d.GetPosition(), v = d.GetLinearVelocity();
  return { x: -32 * p.x, y: -32 * p.y, vx: -32 * v.x, vy: -32 * v.y, awake: d.IsAwake() };
});
log("fb teleported: " + JSON.stringify(fbCheck));

// 左行触杆：ArrowLeft 按住直到 lever2 state==1
await page.keyboard.down("ArrowLeft");
const leverResult = await page.evaluate(async () => {
  const g = window.Phaser.GAMES[0];
  const lever = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "lever");
  const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
  const px = (m) => -32 * m;
  const trace = [];
  const t0 = performance.now();
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      const p = p3.body.data.GetPosition(), v = p3.body.data.GetLinearVelocity();
      trace.push({ t: +(performance.now() - t0).toFixed(0), x: +px(p.x).toFixed(2), vx: +px(v.x).toFixed(2), st: lever.state });
      if (lever.state === 1 && Math.abs(px(v.x)) < 0.5 && trace.length > 3 && trace[trace.length - 1].x === trace[trace.length - 2].x) {
        clearInterval(iv);
        resolve({ flipped: true, settleMs: performance.now() - t0, finalX: trace[trace.length - 1].x, trace });
      } else if (performance.now() - t0 > 8000) {
        clearInterval(iv);
        resolve({ flipped: lever.state === 1, settleMs: 8000, finalX: trace[trace.length - 1]?.x, trace });
      }
    }, 33);
  });
});
await page.keyboard.up("ArrowLeft").catch(() => {});
log("lever: flipped=" + leverResult.flipped + " finalX=" + leverResult.finalX + " settleMs=" + +leverResult.settleMs.toFixed(0));

// P3 驻东确认 + fb 末位 + 采样排空
await page.waitForTimeout(600);
const final = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lever = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "lever");
  const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
  const p = p3.body.data.GetPosition();
  const df = g.level.pers1.body.data.GetPosition();
  return { leverState: lever.state, p3X: -32 * p.x, p3Y: -32 * p.y, fbX: -32 * df.x, fbY: -32 * df.y, st: g.state.current };
});
log("final: " + JSON.stringify(final));
const out = { shapeApi, fbCheck, lever: { flipped: leverResult.flipped, settleMs: leverResult.settleMs, finalX: leverResult.finalX }, trace: leverResult.trace, final };
writeFileSync(join(HERE, "p1-leverflip.json"), JSON.stringify(out, null, 1));
log("saved p1-leverflip.json");
await browser.close();

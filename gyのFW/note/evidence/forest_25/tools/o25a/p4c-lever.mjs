/**
 * p4c：lever-摆杆泵摆 v2（沙箱传送）。修正：bob=platform(331px 宽板)；
 * 泵法=限位西移（wg 不越过板心西 120px，防走落板头）+ 西摆相位跳；
 * 45s 计时内完成：teleport 后立即泵。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4c] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
log("in, unpaused");

const sleep = (ms) => page.waitForTimeout(ms);
const snap = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const rp = (p) => { if (!p?.body) return null; const r = p.body.data.GetPosition(); const v = p.body.data.GetLinearVelocity(); return { x: +(-32 * r.x).toFixed(1), y: +(-32 * r.y).toFixed(1), vx: +(-32 * v.x).toFixed(1), vy: +(-32 * v.y).toFixed(1) }; };
    let lever = null, wind = null, plat = null;
    for (const grp of Object.values(lv.MechManager?.deviceGroups ?? g.MechManager?.deviceGroups ?? {})) {
      for (const d of grp) {
        const t = d.options?.type;
        if (t === "wind") wind = { running: d.running, state: d.state };
        else if (t === "hanging") plat = d.platform?.body?.data ? { x: +(d.platform.x ?? NaN).toFixed(1), y: +(d.platform.y ?? NaN).toFixed(1), vx: +(d.platform.body.data.GetLinearVelocity().x * -32).toFixed(1) } : null;
        else if (d.joint && d.options?.properties?.onis != null) lever = { state: d.state, angle: +(d.joint.GetJointAngleRadians?.() ?? 0).toFixed(3) };
      }
    }
    return { wg: rp(lv.pers2), wind, lever, plat, st: g.state.current, clock: lv.ui?.clock?.getElapsedSeconds?.() ?? null };
  });

const s0 = await snap();
log(`initial lever=${JSON.stringify(s0.lever)} wind=${JSON.stringify(s0.wind)} plat=${JSON.stringify(s0.plat)}`);

// 传送 wg 站上摆板（板心 688,744 → 站位 690）
await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const p2 = g.level.pers2.body.data;
  p2.SetLinearVelocity({ x: 0, y: 0 });
  p2.SetPosition({ x: -688 / 32, y: -690 / 32 });
});
await sleep(700);
const s1 = await snap();
log(`after tp: wg=${JSON.stringify(s1.wg)} plat=${JSON.stringify(s1.plat)}`);

// 泵摆 38s：限位西移 + 西摆相持 A + 西极点跳
let platXMin = 999, leverFlip = null, windOff = false;
const trace = [];
const t0 = Date.now();
let jumping = false;
while (Date.now() - t0 < 38000) {
  const s = await snap();
  if (!s.wg || s.st !== "level") break;
  if (s.plat) platXMin = Math.min(platXMin, s.plat.x);
  if (s.lever && s1.lever && s.lever.state !== s1.lever.state && !leverFlip) leverFlip = { t: Date.now() - t0, ...s.lever };
  if (s.wind && s.wind.running === false) { windOff = true; trace.push({ t: Date.now() - t0, ...s }); log("WIND OFF!"); break; }
  trace.push({ t: Date.now() - t0, wg: s.wg, plat: s.plat, lever: s.lever, clock: s.clock });
  if (s.plat && s.wg) {
    const rel = s.wg.x - s.plat.x;
    // 西摆中：向板心西 60-120 区域走（限位），东摆时回中
    if (s.plat.vx < -15 && rel > -60 && rel < 200) await page.keyboard.down(WG.left);
    else await page.keyboard.up(WG.left);
    if (s.plat.vx > 15 && rel < -30) await page.keyboard.down(WG.right);
    else await page.keyboard.up(WG.right);
    // 西极点跳：plat vx 由负转正附近
    if (s.plat.vx > -5 && s.plat.vx < 60 && !jumping && rel < -20) {
      jumping = true;
      await page.keyboard.down(WG.up);
      await sleep(50);
      await page.keyboard.up(WG.up);
      jumping = false;
    }
  }
  await sleep(140);
}
await page.keyboard.up(WG.left).catch(() => {});
await page.keyboard.up(WG.right).catch(() => {});
const fin = await snap();
const out = { s0, s1, platXMin, leverFlip, windOff, fin, trace: trace.filter((_, i) => i % 2 === 0) };
writeFileSync(join(HERE, "p4c-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ platXMin, leverFlip, windOff, wind: fin.wind, lever: fin.lever, wg: fin.wg, plat: fin.plat, st: fin.st })}`);
await browser.close();

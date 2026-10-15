/**
 * p4b：lever-摆杆交互机器验证（沙箱传送，非玩法主张）。
 * wg 传送到 bob 静置点上（(688,689.8) 站位）→ 持 A + 周期跳泵摆 35s →
 * 观测：bob x_min、lever angle/state、wind.running。
 * 若 lever 翻转 & 风停 → mesa 东行在 wind-off 下可解 → 05号档 ORACLE_SOLVED 证据链；
 * 若泵不到 → INCONCLUSIVE-lever（交互未证伪，仅脚本泵摆能力不足）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4b] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForTimeout(5000);
log("in");

const sleep = (ms) => page.waitForTimeout(ms);
const snap = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const rp = (p) => { if (!p?.body) return null; const r = p.body.data.GetPosition(); const v = p.body.data.GetLinearVelocity(); return { x: +(-32 * r.x).toFixed(1), y: +(-32 * r.y).toFixed(1), vx: +(-32 * v.x).toFixed(1), vy: +(-32 * v.y).toFixed(1) }; };
    let lever = null, wind = null, bob = null;
    for (const grp of Object.values(lv.MechManager?.deviceGroups ?? g.MechManager?.deviceGroups ?? {})) {
      for (const d of grp) {
        const t = d.options?.type;
        if (t === "wind") wind = { running: d.running, state: d.state };
        else if (t === "hanging") bob = { x: +(d.bob?.x ?? d.sprite?.x ?? NaN).toFixed(1), y: +(d.bob?.y ?? d.sprite?.y ?? NaN).toFixed(1), vx: d.bob?.body ? +(d.bob.body.velocity?.x ?? 0).toFixed(1) : null };
        else if (d.joint && d.options?.properties?.onis != null) lever = { state: d.state, angle: +(d.joint.GetJointAngleRadians?.() ?? 0).toFixed(3) };
      }
    }
    return { wg: rp(lv.pers2), wind, lever, bob, st: g.state.current };
  });

// 初始状态
const s0 = await snap();
log(`initial: ${JSON.stringify(s0)}`);

// 传送 wg 到 bob 上（bob 静置 688,744；站位中心 689.8 → y=690）
await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const p2 = g.level.pers2.body.data;
  p2.SetLinearVelocity({ x: 0, y: 0 });
  p2.SetPosition({ x: -688 / 32, y: -690 / 32 });
});
await sleep(600);
const s1 = await snap();
log(`after tp: wg=${JSON.stringify(s1.wg)} bob=${JSON.stringify(s1.bob)}`);

// 泵摆：持 A；bob 西摆(vx<0)时跳、东摆时静——参数化泵
let bobXMin = 999, flipAt = null;
const log15 = [];
const t0 = Date.now();
await page.keyboard.down(WG.left);
while (Date.now() - t0 < 35000) {
  const s = await snap();
  if (s.bob) bobXMin = Math.min(bobXMin, s.bob.x);
  if (s.lever && (s.lever.state !== s1.lever.state || Math.abs(s.lever.angle - s1.lever.angle) > 0.3) && !flipAt) flipAt = { t: Date.now() - t0, ...s.lever };
  if (s.wind && s.wind.running === false) { log15.push({ t: Date.now() - t0, ...s }); log("WIND OFF!"); break; }
  if (s.st !== "level") break;
  log15.push({ t: Date.now() - t0, bob: s.bob, lever: s.lever, wind: s.wind, wg: s.wg });
  // 相位跳：bob 西移时跳（加重西摆）
  if (s.bob && s.bob.vx < -20) {
    await page.keyboard.down(WG.up);
    await sleep(50);
    await page.keyboard.up(WG.up);
  }
  await sleep(400);
}
await page.keyboard.up(WG.left).catch(() => {});
const fin = await snap();
const out = { initial: s0, afterTp: s1, bobXMin, flipAt, fin, log: log15 };
writeFileSync(join(HERE, "p4b-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ bobXMin, flipAt, wind: fin.wind, lever: fin.lever, wg: fin.wg, bob: fin.bob, st: fin.st })}`);
await browser.close();

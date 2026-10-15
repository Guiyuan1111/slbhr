/**
 * p4f：lever-摆杆泵摆 v3（沙箱能力探针）。
 * 已证（p4b）：持 A 可把摆板泵到西弧（板心 x≈440-600），但 wg 走过板头（宽331px）掉落。
 * 本版：①bob=lv.objects[6].platform（真实句柄）；②限位：wg 不越过板心西 120px（超则松A回踩）；
 * ③西摆相持跳（vx<-20 且西偏时跳，跳落冲击+西偏重量→板抬头压杆盒[459,469]×[440,485]）；
 * ④掉落看门狗：wg 落绿台则重传回板（纯沙箱能力测量，非玩法主张）。
 * 判据：lever l0（deviceGroups.4[1]）state→0 或 angle<0 → wind OFF → wind-off 下 mesa 东行可解性另行验证。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4f] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
log("in, unpaused");

const sleep = (ms) => page.waitForTimeout(ms);
const snap = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const rp = (p) => { if (!p?.body?.data) return null; const r = p.body.data.GetPosition(); const v = p.body.data.GetLinearVelocity(); return { x: +(-32 * r.x).toFixed(1), y: +(-32 * r.y).toFixed(1), vx: +(-32 * v.x).toFixed(1), vy: +(-32 * v.y).toFixed(1) }; };
    let lever = null, wind = null;
    for (const d of (g.MechManager?.deviceGroups?.["4"] ?? [])) {
      if (d.options?.type === "wind") wind = { running: d.running, state: d.state };
      else if (d.options?.type === "lever") lever = { state: d.state, angle: +(d.joint?.GetJointAngleRadians?.() ?? 0).toFixed(3) };
    }
    const h = lv.objects?.[6];
    const plat = h?.platform ? { x: +h.platform.x.toFixed(1), y: +h.platform.y.toFixed(1), vx: h.platform.body?.data ? +(-32 * h.platform.body.data.GetLinearVelocity().x).toFixed(1) : null } : null;
    return { wg: rp(lv.pers2), wind, lever, plat, st: g.state.current };
  });

const teleport = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const p2 = g.level.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetPosition({ x: -688 / 32, y: -686 / 32 });
    p2.SetAwake(true);
  });

const s0 = await snap();
log(`initial lever=${JSON.stringify(s0.lever)} wind=${JSON.stringify(s0.wind)} plat=${JSON.stringify(s0.plat)}`);
await teleport();
await sleep(500);
// 唤醒+落板确认：跳一下
await page.keyboard.down(WG.up); await sleep(60); await page.keyboard.up(WG.up);
await sleep(500);
const s1 = await snap();
log(`after tp: wg=${JSON.stringify(s1.wg)} plat=${JSON.stringify(s1.plat)}`);
if (!s1.plat || s1.wg.y > 900) { log("TP FAILED — abort"); await browser.close(); process.exit(1); }

let platXMin = 999, platYMin = 999, leverFlip = null, windOffAt = null, retP = 0;
const trace = [];
const t0 = Date.now();
while (Date.now() - t0 < 37000) {
  const s = await snap();
  if (s.st !== "level") { log(`state→${s.st}`); break; }
  if (s.plat) { platXMin = Math.min(platXMin, s.plat.x); platYMin = Math.min(platYMin, s.plat.y); }
  if (s.lever && s0.lever && (s.lever.state !== s0.lever.state) && !leverFlip) leverFlip = { t: Date.now() - t0, ...s.lever };
  if (s.wind && s.wind.running === false && !windOffAt) { windOffAt = Date.now() - t0; log(`WIND OFF @${windOffAt}ms`); }
  if (!s.wg) break;
  trace.push({ t: Date.now() - t0, wg: s.wg, plat: s.plat, lever: s.lever, wind: s.wind });
  if (s.wind?.running === false) break;
  // 看门狗：掉到绿台(≈843)或更低 → 重传回板
  if (s.wg.y > 830) {
    retP++;
    log(`fell off (y=${s.wg.y}) → re-teleport #${retP}`);
    await page.keyboard.up(WG.left); await page.keyboard.up(WG.right);
    await teleport(); await sleep(400);
    await page.keyboard.down(WG.up); await sleep(60); await page.keyboard.up(WG.up);
    await sleep(400);
    continue;
  }
  if (s.plat) {
    const rel = s.wg.x - s.plat.x;
    // 限位西移：想往西走，但不越过板心西 120px；越过则回踩东
    if (rel > -120 && s.plat.x > 470) await page.keyboard.down(WG.left); else await page.keyboard.up(WG.left);
    if (rel < -125 || (s.plat.x <= 470 && rel > -40)) await page.keyboard.down(WG.right); else await page.keyboard.up(WG.right);
    // 西摆相持跳：板西移且 wg 已在西偏侧 → 跳（落地冲击+西偏重量）
    if (s.plat.vx < -20 && rel < -30 && s.plat.x > 480) {
      await page.keyboard.down(WG.up); await sleep(50); await page.keyboard.up(WG.up);
    }
    // 弧上猛跳：板心过 470 后每拍跳（对杆盒施压）
    if (s.plat.x <= 480 && !s.wg.airborneish) { /* jump spam handled by vx branch */ }
  } else {
    await page.keyboard.up(WG.left); await page.keyboard.up(WG.right);
  }
  await sleep(130);
}
await page.keyboard.up(WG.left).catch(() => {});
await page.keyboard.up(WG.right).catch(() => {});
await sleep(600);
const fin = await snap();
const out = { s0, s1, platXMin, platYMin, leverFlip, windOffAt, retP, fin, trace: trace.filter((_, i) => i % 2 === 0) };
writeFileSync(join(HERE, "p4f-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ platXMin, platYMin, leverFlip, windOffAt, retP, wind: fin.wind, lever: fin.lever, wg: fin.wg, plat: fin.plat, st: fin.st })}`);
await browser.close();

/**
 * p4g：lever-摆杆泵摆 v4。
 * 修正（据 p4f）：①tp 后不跳醒（p4f 跳醒冲击把 wg 弹飞落绿台）；②停 45s 计时器（evaluate 往返
 * ~300-600ms，泵摆窗口不够——沙箱能力探针，停表须在 05号档披露）；③持 A 限位西移（p4b 已证持 A
 * 可达西弧），仅当振幅停滞 3s+ 才升级为西摆相持跳。
 * 判据：lever l0 state→0 / angle<0 → wind.running=false。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4g] ${m}`);

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

// 停计时器（多策略 try）
const timerInfo = await page.evaluate(() => {
  const lv = window.Phaser.GAMES[0].level;
  const ui = lv.ui ?? {};
  const clk = ui.clock ?? null;
  const info = { uiKeys: Object.keys(ui), clockType: clk?.constructor?.name ?? null, clockKeys: clk ? Object.keys(clk) : null };
  try { clk?.timer?.stop(); info.stopped1 = true; } catch (e) { info.e1 = String(e); }
  try { clk?.stop?.(); info.stopped2 = true; } catch (e) { info.e2 = String(e); }
  try { if (clk?.timer) clk.timer.autoDestroy = false; } catch { /* ignore */ }
  try { lv.levelState && (lv.levelState.timeLeft = 99999); } catch { /* ignore */ }
  try { Object.defineProperty(lv, "gameFinish", { value: lv.gameFinish, writable: true }); } catch { /* ignore */ }
  return info;
});
log(`timer: ${JSON.stringify(timerInfo)}`);

const teleport = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const p2 = g.level.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetPosition({ x: -688 / 32, y: -690 / 32 });
    p2.SetAwake(true);
  });

const s0 = await snap();
log(`initial lever=${JSON.stringify(s0.lever)} wind=${JSON.stringify(s0.wind)} plat=${JSON.stringify(s0.plat)}`);
await teleport();
await sleep(700);
const s1 = await snap();
log(`after tp: wg=${JSON.stringify(s1.wg)} plat=${JSON.stringify(s1.plat)}`);
if (!s1.plat || !s1.wg || s1.wg.y > 830) { log("TP FAILED — abort"); await browser.close(); process.exit(1); }

let platXMin = 999, platYMin = 999, leverFlip = null, windOffAt = null, retP = 0, stallMs = 0;
const trace = [];
const t0 = Date.now();
let holdA = false, holdD = false;
while (Date.now() - t0 < 55000) {
  const s = await snap();
  if (!s || s.st !== "level") { log(`state→${s?.st}`); break; }
  if (s.plat) { platXMin = Math.min(platXMin, s.plat.x); platYMin = Math.min(platYMin, s.plat.y); }
  if (s.lever && s0.lever && s.lever.state !== s0.lever.state && !leverFlip) leverFlip = { t: Date.now() - t0, ...s.lever };
  if (s.wind && s.wind.running === false && !windOffAt) { windOffAt = Date.now() - t0; log(`WIND OFF @${windOffAt}ms`); }
  if (!s.wg) break;
  trace.push({ t: Date.now() - t0, wg: s.wg, plat: s.plat, lever: s.lever });
  if (s.wind?.running === false) break;
  if (s.wg.y > 830) {
    retP++;
    log(`fell off (y=${s.wg.y}) → re-teleport #${retP}`);
    if (holdA) { await page.keyboard.up(WG.left); holdA = false; }
    if (holdD) { await page.keyboard.up(WG.right); holdD = false; }
    await teleport(); await sleep(600);
    continue;
  }
  if (s.plat) {
    const rel = s.wg.x - s.plat.x;
    // 持 A 限位西移：板心未到弧区(>480)且 wg 未越过板心西 110px → 走西
    const wantA = s.plat.x > 480 && rel > -110;
    const wantD = rel < -115; // 越限回踩
    if (wantA !== holdA) { await page.keyboard[wantA ? "down" : "up"](WG.left); holdA = wantA; }
    if (wantD !== holdD) { await page.keyboard[wantD ? "down" : "up"](WG.right); holdD = wantD; }
    // 振幅停滞检测：板心 >560 持续 4s+ → 升级西摆相持跳
    if (s.plat.x > 560) stallMs += 350; else stallMs = 0;
    if (stallMs > 4000 && s.plat.vx < -30 && rel < -60 && s.wg.vy < 5) {
      stallMs = 0;
      await page.keyboard.down(WG.up); await sleep(50); await page.keyboard.up(WG.up);
    }
  }
  await sleep(280);
}
if (holdA) await page.keyboard.up(WG.left).catch(() => {});
if (holdD) await page.keyboard.up(WG.right).catch(() => {});
await sleep(500);
const fin = await snap();
const out = { s0, s1, platXMin, platYMin, leverFlip, windOffAt, retP, fin, trace: trace.filter((_, i) => i % 2 === 0) };
writeFileSync(join(HERE, "p4g-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ platXMin, platYMin, leverFlip, windOffAt, retP, wind: fin.wind, lever: fin.lever, wg: fin.wg, plat: fin.plat, st: fin.st })}`);
await browser.close();

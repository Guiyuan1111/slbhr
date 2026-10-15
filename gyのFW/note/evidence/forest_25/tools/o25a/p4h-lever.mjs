/**
 * p4h：lever-摆杆泵摆 v5（in-page 60fps 控制器）。
 * p4g 关键修正依据：
 *  - p4b"乘坐"是误读：tp 到 x=688 骑在竖 bar 碰撞体线上被挤落绿台(842.9)，持 A 是在绿台上步行——本版 tp x=712 避 bar；
 *  - CDP evaluate 往返 300-600ms 无法做位置夹持 → 控制器下页（rAF+合成 KeyboardEvent，A/D/W）；
 *  - 计时器覆写 lv.ui.clock.getElapsedSeconds=()=>0 + levelData.time=9999（p4g 的 stop() 无效，仍 endGame）。
 * 判据：l0（deviceGroups.4[1]）state→0 / angle<0 → wind.running=false。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4h] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
log("in, unpaused");

// 停计时 + 安装 in-page 泵控制器
const inst = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const out = {};
  try { lv.levelData.time = 99999; out.time = lv.levelData.time; } catch (e) { out.eTime = String(e); }
  try { lv.ui.clock.getElapsedSeconds = () => 0; out.clock = "hooked"; } catch (e) { out.eClock = String(e); }
  // tp 到板心东侧 24px（避 bar 线 x=688 的碰撞体）
  const tp = () => {
    const p2 = g.level.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetPosition({ x: -712 / 32, y: -690 / 32 });
    p2.SetAwake(true);
  };
  tp();
  out.tp = true;
  // 泵控制器：A/D 合成键 + 相持跳；60fps
  window.__pump = { on: true, ev: [], retP: 0, jumped: 0, stall: 0 };
  const send = (code, down) => {
    for (const tgt of [window, document]) {
      const ev = new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "keyCode", { get: () => code });
      Object.defineProperty(ev, "which", { get: () => code });
      tgt.dispatchEvent(ev);
    }
  };
  const A = 65, D = 68, W = 87;
  let aOn = false, dOn = false;
  const ctrl = () => {
    if (!window.__pump.on) return;
    try {
      const lv2 = g.level;
      const wg = lv2.pers2.body.data.GetPosition();
      const wx = -32 * wg.x, wy = -32 * wg.y;
      const h = lv2.objects && lv2.objects[6];
      const bx = h && h.platform ? h.platform.x : null;
      if (wy > 830) { // 掉落看门狗：回传
        window.__pump.retP++;
        if (aOn) { send(A, false); aOn = false; }
        if (dOn) { send(D, false); dOn = false; }
        tp();
      } else if (bx != null) {
        const rel = wx - bx;
        const wantA = bx > 480 && rel > -105;
        const wantD = rel < -120 || (bx <= 480 && rel > -35);
        if (wantA !== aOn) { send(A, wantA); aOn = wantA; }
        if (wantD !== dOn) { send(D, wantD); dOn = wantD; }
        // 振幅停滞升级跳：板心 >560 持续 ~3s → 板西摆时跳
        const bvx = h.platform.body && h.platform.body.data ? -32 * h.platform.body.data.GetLinearVelocity().x : 0;
        if (bx > 560) window.__pump.stall++; else window.__pump.stall = 0;
        const wv = lv2.pers2.body.data.GetLinearVelocity();
        if (window.__pump.stall > 180 && bvx < -30 && rel < -60 && Math.abs(-32 * wv.y) < 30) {
          window.__pump.stall = 0;
          send(W, true);
          setTimeout(() => send(W, false), 60);
          window.__pump.jumped++;
        }
      }
      window.__pump.last = { wx: +wx.toFixed(1), wy: +wy.toFixed(1), bx: bx != null ? +bx.toFixed(1) : null };
    } catch (e) { window.__pump.err = String(e); window.__pump.on = false; }
    requestAnimationFrame(ctrl);
  };
  requestAnimationFrame(ctrl);
  out.ctrl = "installed";
  return out;
});
log(`install: ${JSON.stringify(inst)}`);

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
    const plat = h?.platform ? { x: +h.platform.x.toFixed(1), y: +h.platform.y.toFixed(1) } : null;
    return { wg: rp(lv.pers2), wind, lever, plat, st: g.state.current, pump: { retP: window.__pump?.retP, jumped: window.__pump?.jumped, err: window.__pump?.err ?? null } };
  });

await sleep(1200);
const s1 = await snap();
log(`landed: wg=${JSON.stringify(s1.wg)} plat=${JSON.stringify(s1.plat)} lever=${JSON.stringify(s1.lever)}`);
if (!s1.plat || !s1.wg || s1.wg.y > 830) { log("LAND FAILED — abort"); window: await page.evaluate(() => (window.__pump.on = false)); await browser.close(); process.exit(1); }

let platXMin = 999, platYMin = 999, leverFlip = null, windOffAt = null;
const trace = [];
const t0 = Date.now();
while (Date.now() - t0 < 70000) {
  const s = await snap();
  if (!s || s.st !== "level") { log(`state→${s?.st}`); break; }
  if (s.plat) { platXMin = Math.min(platXMin, s.plat.x); platYMin = Math.min(platYMin, s.plat.y); }
  if (s.lever && s1.lever && s.lever.state !== s1.lever.state && !leverFlip) leverFlip = { t: Date.now() - t0, ...s.lever };
  if (s.wind && s.wind.running === false && !windOffAt) { windOffAt = Date.now() - t0; log(`WIND OFF @${windOffAt}ms`); }
  trace.push({ t: Date.now() - t0, wg: s.wg, plat: s.plat, lever: s.lever });
  if (windOffAt) break;
  await sleep(2000);
}
await page.evaluate(() => { window.__pump.on = false; });
const fin = await snap();
const out = { s1, platXMin, platYMin, leverFlip, windOffAt, fin, trace };
writeFileSync(join(HERE, "p4h-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ platXMin, platYMin, leverFlip, windOffAt, wind: fin.wind, lever: fin.lever, wg: fin.wg, plat: fin.plat, pump: fin.pump, st: fin.st })}`);
await browser.close();

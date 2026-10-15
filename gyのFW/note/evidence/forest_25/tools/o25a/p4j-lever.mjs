/**
 * p4j：lever-摆杆共振泵 v6。
 * 依据：p4h2 证明恒 A 陷弧底势阱（板随人走，无相对滑动）；能量输入须相位匹配——
 * 板西摆(vx<-25)时 A、东摆(vx>+25)时 D（顺运动方向压板=荡秋千泵），极点附近滑行；
 * 限位 rel∈[-105,+100] 防走板头（板半宽165）；停滞4s+ 才升级西极点跳。
 * 已证（bundle 1645900-1649600）：platform 动态体、摆臂 revolute ±0.85·π/2、乘员西偏倾板
 * → 板缘在弧区切入杆盒 [459.2,468.8]×[440,484.8] → 西推 τ<0 → angle·onis>0 → state 1→0。
 * 判据：lever l0 state→0 或 wind.running=false。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4j] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });

await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  lv.levelData.time = 99999;
  lv.ui.clock.getElapsedSeconds = () => 0;
  window.__pump = { on: true, buf: [], retP: 0, jumped: 0, frame: 0, stall: 0 };
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
  const tp = () => {
    const p2 = g.level.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetPosition({ x: -712 / 32, y: -690 / 32 });
    p2.SetAwake(true);
    window.__pump.retP++;
  };
  tp();
  let wUntil = 0;
  const ctrl = () => {
    if (!window.__pump.on) return;
    const P = window.__pump;
    try {
      P.frame++;
      const lv2 = g.level;
      const wgB = lv2.pers2.body.data;
      const wpos = wgB.GetPosition();
      const wx = -32 * wpos.x, wy = -32 * wpos.y;
      const h = lv2.objects && lv2.objects[6];
      const plat = h && h.platform;
      if (wy > 830) {
        if (aOn) { send(A, false); aOn = false; }
        if (dOn) { send(D, false); dOn = false; }
        tp();
      } else if (plat && plat.body && plat.body.data) {
        const bx = plat.x;
        const bvx = -32 * plat.body.data.GetLinearVelocity().x;
        const rel = wx - bx;
        // 相位共振泵
        let wantA = bvx < -25 && rel > -105;
        let wantD = bvx > 25 && rel < 100;
        // 极点滑行后回中偏置：靠近东极端时板不动也拉回
        if (Math.abs(bvx) <= 25 && rel > 60) { wantD = true; }
        if (Math.abs(bvx) <= 25 && rel < -60 && bx > 470) { wantA = true; }
        if (wantA !== aOn) { send(A, wantA); aOn = wantA; }
        if (wantD !== dOn) { send(D, wantD); dOn = wantD; }
        // 停滞检测 + 西极点跳
        if (bx > 560) P.stall++; else P.stall = 0;
        const wvy = wgB.GetLinearVelocity().y;
        if (P.stall > 240 && bvx > -35 && bvx < 40 && rel < -40 && Math.abs(-32 * wvy) < 40) {
          P.stall = 0; P.jumped++;
          send(W, true);
          wUntil = P.frame + 4;
        }
        if (wUntil && P.frame >= wUntil) { send(W, false); wUntil = 0; }
      }
      if (P.frame % 10 === 0) {
        P.buf.push({
          f: P.frame, wx: +wx.toFixed(1), wy: +wy.toFixed(1),
          bx: plat ? +plat.x.toFixed(1) : null, by: plat ? +plat.y.toFixed(1) : null,
          bvx: plat && plat.body?.data ? +(-32 * plat.body.data.GetLinearVelocity().x).toFixed(1) : null,
          rot: plat ? +((plat.rotation || 0)).toFixed(3) : null, a: aOn, d: dOn,
        });
      }
    } catch (e) { P.err = String(e); P.on = false; }
    requestAnimationFrame(ctrl);
  };
  requestAnimationFrame(ctrl);
});
log("controller installed");

const sleep = (ms) => page.waitForTimeout(ms);
const snap = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    let lever = null, wind = null;
    for (const d of (g.MechManager?.deviceGroups?.["4"] ?? [])) {
      if (d.options?.type === "wind") wind = { running: d.running, state: d.state };
      else if (d.options?.type === "lever") lever = { state: d.state, angle: +(d.joint?.GetJointAngleRadians?.() ?? 0).toFixed(3) };
    }
    return { wind, lever, st: g.state.current, retP: window.__pump.retP, jumped: window.__pump.jumped, err: window.__pump.err ?? null };
  });

let leverFlip = null, windOffAt = null;
const t0 = Date.now();
while (Date.now() - t0 < 75000) {
  const s = await snap();
  if (!s || s.st !== "level") { log(`state→${s?.st} err=${s?.err}`); break; }
  if (s.lever && s.lever.state === 0 && !leverFlip) leverFlip = { t: Date.now() - t0, ...s.lever };
  if (s.wind && s.wind.running === false && !windOffAt) { windOffAt = Date.now() - t0; log(`WIND OFF @${windOffAt}ms`); }
  if (windOffAt || leverFlip) break;
  await sleep(1500);
}
await page.evaluate(() => { window.__pump.on = false; });
const buf = await page.evaluate(() => window.__pump.buf);
const fin = await snap();
const bxMin = Math.min(...buf.map((r) => r.bx ?? 999));
const byMin = Math.min(...buf.map((r) => r.by ?? 999));
const rotMax = Math.max(...buf.map((r) => Math.abs(r.rot ?? 0)));
const out = { leverFlip, windOffAt, bxMin, byMin, rotMax, fin, buf };
writeFileSync(join(HERE, "p4j-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ bxMin, byMin, rotMax, leverFlip, windOffAt, wind: fin.wind, lever: fin.lever, retP: fin.retP, jumped: fin.jumped, err: fin.err, st: fin.st })}`);
await browser.close();

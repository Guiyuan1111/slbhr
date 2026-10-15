/**
 * p4k：lever 泵摆终版 v7（时间盒：本槽最后一次尝试）。
 * p4j 病因：A 相位行走越限滑落（retP=137），跳升级门槛 rel<-40 从未满足（rel 卡 +30）。
 * 修正：①西相位用"跳"代"走"（bvx<-25 && rel∈[-60,-20] → W 跳，空中保 A 漂西，落地=西向冲击扭矩）；
 * ②rel<-130 硬回东（D 直到 rel>-80）；③东相位 D 行走不变；④停滞>2s 无条件升级跳。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4k] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });

await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  lv.levelData.time = 99999;
  lv.ui.clock.getElapsedSeconds = () => 0;
  window.__pump = { on: true, buf: [], retP: 0, jumped: 0, frame: 0 };
  const send = (code, down) => {
    for (const tgt of [window, document]) {
      const ev = new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "keyCode", { get: () => code });
      Object.defineProperty(ev, "which", { get: () => code });
      tgt.dispatchEvent(ev);
    }
  };
  const A = 65, D = 68, W = 87;
  let aOn = false, dOn = false, wUntil = 0, recov = false;
  const tp = () => {
    const p2 = g.level.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetPosition({ x: -712 / 32, y: -690 / 32 });
    p2.SetAwake(true);
    window.__pump.retP++;
  };
  tp();
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
      if (wy > 800) {
        if (aOn) { send(A, false); aOn = false; }
        if (dOn) { send(D, false); dOn = false; }
        recov = false;
        tp();
      } else if (plat && plat.body && plat.body.data) {
        const bx = plat.x;
        const bvx = -32 * plat.body.data.GetLinearVelocity().x;
        const rel = wx - bx;
        // 越限硬恢复：深西 → D 直到回 -80
        if (rel < -130) recov = true;
        if (recov && rel > -80) recov = false;
        let wantA = false, wantD = false;
        if (recov) {
          wantD = true;
        } else {
          wantA = bvx < -25 && rel > -60;         // 西相位走（浅西区）
          wantD = bvx > 25 && rel < 100;          // 东相位走
          if (Math.abs(bvx) <= 25 && rel > 60) wantD = true;
        }
        if (wantA !== aOn) { send(A, wantA); aOn = wantA; }
        if (wantD !== dOn) { send(D, wantD); dOn = wantD; }
        // 西相位跳：西摆且浅西区、立足未跌 → 跳（空中保 A 漂西）
        if (!recov && bvx < -25 && rel > -62 && rel < -18 && wy < 830 && Math.abs(wgB.GetLinearVelocity().y) < 30) {
          P.jumped++;
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
          rel: plat ? +(wx - plat.x).toFixed(1) : null, rec: recov,
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
const relMin = Math.min(...buf.map((r) => r.rel ?? 999));
const out = { leverFlip, windOffAt, bxMin, relMin, fin, buf };
writeFileSync(join(HERE, "p4k-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ bxMin, relMin, leverFlip, windOffAt, wind: fin.wind, lever: fin.lever, retP: fin.retP, jumped: fin.jumped, err: fin.err, st: fin.st })}`);
await browser.close();

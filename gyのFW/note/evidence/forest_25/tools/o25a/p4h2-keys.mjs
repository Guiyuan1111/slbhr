/**
 * p4h2：p4h 控制器加仪表（环形缓冲每帧记录 wx/bx/aOn/dOn/awake），20s 短跑定位"站桩"原因。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4h2] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });

await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  lv.levelData.time = 99999;
  lv.ui.clock.getElapsedSeconds = () => 0;
  window.__pump = { on: true, buf: [], retP: 0, frame: 0 };
  const send = (code, down) => {
    for (const tgt of [window, document]) {
      const ev = new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "keyCode", { get: () => code });
      Object.defineProperty(ev, "which", { get: () => code });
      tgt.dispatchEvent(ev);
    }
  };
  const A = 65, D = 68;
  window.__pump.aOn = false; window.__pump.dOn = false;
  let aOn = false, dOn = false;
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
      const wx = -32 * wgB.GetPosition().x, wy = -32 * wgB.GetPosition().y;
      const h = lv2.objects && lv2.objects[6];
      const bx = h && h.platform ? h.platform.x : null;
      if (wy > 830) {
        if (aOn) { send(A, false); aOn = false; }
        if (dOn) { send(D, false); dOn = false; }
        tp();
      } else if (bx != null) {
        const rel = wx - bx;
        const wantA = bx > 480 && rel > -105;
        const wantD = rel < -120 || (bx <= 480 && rel > -35);
        if (wantA !== aOn) { send(A, wantA); aOn = wantA; }
        if (wantD !== dOn) { send(D, wantD); dOn = wantD; }
        if (wantA && P.frame % 90 === 0) send(A, true); // 保活重发
        if (P.frame % 120 === 0 && Math.abs(wgB.GetLinearVelocity().x) < 0.05) wgB.SetAwake(true);
      }
      if (P.frame % 10 === 0) {
        P.buf.push({ f: P.frame, wx: +wx.toFixed(1), wy: +wy.toFixed(1), bx: bx != null ? +bx.toFixed(1) : null, a: aOn, d: dOn, awake: wgB.IsAwake(), kd: g.input.keyboard.isDown(65, 0) });
      }
    } catch (e) { P.err = String(e); P.on = false; }
    requestAnimationFrame(ctrl);
  };
  requestAnimationFrame(ctrl);
});

await page.waitForTimeout(20000);
await page.evaluate(() => { window.__pump.on = false; });
const out = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const p2 = g.level.pers2.body.data;
  return { buf: window.__pump.buf, err: window.__pump.err ?? null, retP: window.__pump.retP, final: { x: +(-32 * p2.GetPosition().x).toFixed(1), y: +(-32 * p2.GetPosition().y).toFixed(1) } };
});
writeFileSync(join(HERE, "p4h2-keys.json"), JSON.stringify(out, null, 1));
console.log("retP:", out.retP, "err:", out.err, "final:", JSON.stringify(out.final));
for (const r of out.buf.filter((_, i) => i % 4 === 0)) console.log(`f${r.f} wg=(${r.wx},${r.wy}) bx=${r.bx} A=${r.a ? 1 : 0} D=${r.d ? 1 : 0} awake=${r.awake ? 1 : 0} kdA=${r.kd ? 1 : 0}`);
await browser.close();

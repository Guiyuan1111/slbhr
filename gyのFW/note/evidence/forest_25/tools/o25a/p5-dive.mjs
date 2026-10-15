/**
 * p5：oracle 直落竖井快扫（实验 B，5 配置）。
 * p58（kernel）证伪的 oracle 复核：wg 出生站台东行，井口 [1056,1088]（板上有洞），
 * 需下穿风带 y[166,250] 东段（井口处风力 65.7-82.9N > runForce 50N）。
 * 配置：起跳点 x∈{1010,1030,1046} × 跳后持 D。判据：入井（x∈[1056,1088] 且 y>260）或被吹回。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p5] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });

const results = [];
for (const jx of [1010, 1030, 1046]) {
  for (const hold of [60]) {
    // 复位：fb 无关；wg 站台东行
    await page.evaluate((jx) => {
      const g = window.Phaser.GAMES[0];
      const p2 = g.level.pers2.body.data;
      p2.SetLinearVelocity({ x: 0, y: 0 });
      p2.SetPosition({ x: -960 / 32, y: -92 / 32 });
      p2.SetAwake(true);
      window.__dive = { jx, samples: [], entered: false, maxX: 0, done: false };
      const ctrl = () => {
        if (window.__dive.done) return;
        const lv = g.level;
        const wg = lv.pers2?.body?.data;
        if (!wg) return;
        const wx = -32 * wg.GetPosition().x, wy = -32 * wg.GetPosition().y;
        const v = wg.GetLinearVelocity();
        window.__dive.maxX = Math.max(window.__dive.maxX, wx);
        if (wx >= 1056 && wx <= 1088 && wy > 260) window.__dive.entered = true;
        window.__dive.samples.push({ t: Date.now(), wx: +wx.toFixed(1), wy: +wy.toFixed(1), vx: +(-32 * v.x).toFixed(1) });
        requestAnimationFrame(ctrl);
      };
      requestAnimationFrame(ctrl);
      window.__run = async () => {
        const key = (c, d) => {
          for (const tgt of [window, document]) {
            const ev = new KeyboardEvent(d ? "keydown" : "keyup", { bubbles: true, cancelable: true });
            Object.defineProperty(ev, "keyCode", { get: () => c });
            Object.defineProperty(ev, "which", { get: () => c });
            tgt.dispatchEvent(ev);
          }
        };
        const D = 68, W = 87, A = 65;
        key(D, true);
        const t0 = performance.now();
        while (performance.now() - t0 < 8000) {
          const wg = g.level.pers2?.body?.data;
          if (!wg) break;
          const wx = -32 * wg.GetPosition().x;
          if (wx >= jx) { key(W, true); await new Promise((r) => setTimeout(r, 60)); key(W, false); break; }
          await new Promise((r) => requestAnimationFrame(r));
        }
        await new Promise((r) => setTimeout(r, 2500)); // 入井/吹回窗口
        key(D, false); key(A, true);
        await new Promise((r) => setTimeout(r, 300));
        key(A, false);
        window.__dive.done = true;
      };
      window.__run();
    }, jx).catch(() => {});
    await page.waitForTimeout(11500);
    const r = await page.evaluate(() => {
      const g = window.Phaser.GAMES[0];
      const wg = g.level.pers2?.body?.data;
      const d = window.__dive ?? {};
      const s = d.samples ?? [];
      const last = s.length ? s[s.length - 1] : null;
      const minY = s.length ? Math.min(...s.map((q) => q.wy)) : null;
      return { jx: d.jx, entered: d.entered ?? false, maxX: +(d.maxX ?? 0).toFixed(1), final: wg ? { x: +(-32 * wg.GetPosition().x).toFixed(1), y: +(-32 * wg.GetPosition().y).toFixed(1), dead: !g.level.pers2.alive } : null, minY, last };
    });
    results.push(r);
    log(`jx=${r.jx} entered=${r.entered} maxX=${r.maxX} final=${JSON.stringify(r.final)}`);
    // 若死亡，重进关卡
    if (r.final && (r.final.dead || r.final.y > 950)) {
      await page.evaluate(() => { const g = window.Phaser.GAMES[0]; if (g.state.current === "level") { /* keep */ } });
    }
  }
}
writeFileSync(join(HERE, "p5-dive.json"), JSON.stringify(results, null, 1));
log(`DONE ${JSON.stringify(results.map((r) => ({ jx: r.jx, entered: r.entered, maxX: r.maxX })))}`);
await browser.close();

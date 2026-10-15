/**
 * p5b：oracle 直落竖井 v2（实验 B）。
 * v1 发现：持 D 跑跳直接越过 32px 井口。v2 配置：
 *  A 组（口上垂直跳）：x0∈{1060,1072,1084} 跳后零横输入；
 *  B 组（西漂入井）：x0∈{1120,1140} 跳后松 D（保留起跑残速东向？否——先 A 刹停再跳）。
 * 判据：DEEP=活体 y>340（入井底）；MESA=落 mesa 顶(y≈220, x<1056)；记录带内漂移。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p5b] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });

const run = async (x0, mode) => {
  const r = await page.evaluate(async ({ x0, mode }) => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const key = (c, d) => {
      for (const tgt of [window, document]) {
        const ev = new KeyboardEvent(d ? "keydown" : "keyup", { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "keyCode", { get: () => c });
        Object.defineProperty(ev, "which", { get: () => c });
        tgt.dispatchEvent(ev);
      }
    };
    const D = 68, W = 87, A = 65;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    // 复位到平台 (x0, 92)
    const p2 = lv.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetPosition({ x: -x0 / 32, y: -90 / 32 });
    p2.SetAwake(true);
    await sleep(500);
    const rec = [];
    let t0 = performance.now();
    const samp = () => {
      const wg = lv.pers2?.body?.data;
      if (!wg) return;
      const p = wg.GetPosition();
      rec.push({ t: +((performance.now() - t0) | 0), x: +(-32 * p.x).toFixed(1), y: +(-32 * p.y).toFixed(1) });
    };
    // B 组：先 A 刹停获得西向速度
    if (mode === "west") { key(A, true); await sleep(280); key(A, false); }
    key(W, true); await sleep(60); key(W, false);
    const iv = setInterval(samp, 40);
    await sleep(3500);
    clearInterval(iv);
    const wg = lv.pers2?.body?.data;
    const p = wg ? wg.GetPosition() : null;
    const alive = lv.pers2 ? lv.pers2.alive : false;
    let verdict = "OTHER";
    if (p) {
      const wx = -32 * p.x, wy = -32 * p.y;
      if (alive && wy > 340) verdict = "DEEP";
      else if (wy < 260 && wx < 1056) verdict = "MESA";
      else if (wy < 150) verdict = "PLATFORM";
    }
    const bandSamples = rec.filter((s) => s.y >= 160 && s.y <= 255);
    return { x0, mode, verdict, final: p ? { x: +(-32 * p.x).toFixed(1), y: +(-32 * p.y).toFixed(1) } : null, alive, bandDrift: bandSamples.length ? [bandSamples[0], bandSamples[bandSamples.length - 1]] : null, n: rec.length };
  }, { x0, mode }).catch((e) => ({ x0, mode, err: String(e) }));
  log(`${mode}@${x0}: ${JSON.stringify(r)}`);
  return r;
};

const results = [];
await page.waitForTimeout(1000);
for (const cfg of [[1060, "up"], [1072, "up"], [1084, "up"], [1120, "west"], [1140, "west"]]) {
  results.push(await run(cfg[0], cfg[1]));
}
writeFileSync(join(HERE, "p5b-dive.json"), JSON.stringify(results, null, 1));
log(`DONE ${JSON.stringify(results.map((r) => ({ c: `${r.mode}@${r.x0}`, v: r.verdict, f: r.final })))}`);
await browser.close();

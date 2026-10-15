/** p4e：找 hanging 摆杆实例挂载点 */
import { openGame, enterLevel } from "./lib.mjs";
const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
const out = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const lvKeys = Object.keys(lv);
  const hits = [];
  const probe = (obj, path) => {
    if (!obj || typeof obj !== "object") return;
    for (const k of Object.keys(obj)) {
      try {
        const v = obj[k];
        if (v && typeof v === "object" && (v.platform !== undefined || v.barWidth !== undefined || v.anchor !== undefined)) {
          hits.push({ path: path + "." + k, keys: Object.keys(v).slice(0, 40), platform: v.platform ? { x: v.platform.x, y: v.platform.y, body: !!v.platform.body?.data } : null, barWidth: v.barWidth ?? v.options?.barWidth ?? null, pos: v.position ? { x: v.position.x, y: v.position.y } : null });
        }
      } catch { /* skip */ }
    }
  };
  probe(lv, "lv");
  probe(g, "g");
  // 也扫 lv 的数组容器
  for (const k of lvKeys) {
    const v = lv[k];
    if (Array.isArray(v)) {
      for (let i = 0; i < Math.min(v.length, 40); i++) {
        const e = v[i];
        if (e && typeof e === "object" && (e.platform || e.barWidth !== undefined)) hits.push({ path: `lv.${k}[${i}]`, keys: Object.keys(e).slice(0, 40), platform: e.platform ? { x: e.platform.x, y: e.platform.y, body: !!e.platform.body?.data } : null, barWidth: e.barWidth ?? null });
      }
    }
  }
  return { lvKeys, hits };
});
console.log("lvKeys:", out.lvKeys.join(","));
console.log(JSON.stringify(out.hits, null, 1));
await browser.close();

/** p4d：dump forest_25 全部 device 的结构（找 hanging 真实 type 字符串与 platform 访问路径） */
import { openGame, enterLevel } from "./lib.mjs";

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
const out = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const roots = { "lv.MechManager": lv.MechManager, "g.MechManager": g.MechManager };
  const res = { roots: {} };
  for (const [k, v] of Object.entries(roots)) res.roots[k] = v ? Object.keys(v) : null;
  const dev = [];
  const seen = new Set();
  const scan = (obj, path, depth) => {
    if (!obj || depth > 3 || seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) { obj.forEach((e, i) => scan(e, `${path}[${i}]`, depth + 1)); return; }
    if (typeof obj === "object") {
      if (obj.options && obj.options.type !== undefined) {
        const e = { path, type: obj.options.type, gid: obj.options.gid, keys: Object.keys(obj), optKeys: Object.keys(obj.options) };
        if (obj.platform) e.platform = { x: obj.platform.x, y: obj.platform.y, hasBody: !!obj.platform.body, hasData: !!obj.platform.body?.data };
        if (obj.sprite) e.sprite = { x: obj.sprite.x, y: obj.sprite.y };
        if (obj.joint) e.jointAngle = obj.joint.GetJointAngleRadians ? +obj.joint.GetJointAngleRadians().toFixed(3) : "n/a";
        if (obj.state !== undefined) e.state = obj.state;
        if (obj.running !== undefined) e.running = obj.running;
        dev.push(e);
      }
      for (const k2 of Object.keys(obj)) { try { scan(obj[k2], `${path}.${k2}`, depth + 1); } catch { /* skip */ } }
    }
  };
  scan(g.MechManager, "g.MechManager", 0);
  res.devices = dev;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

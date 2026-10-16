/** p0-inspect：forest_05 oracle 运行时结构普查——机关设备/平台体/杠杆句柄/站位核心高。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p0] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(2000); // 装饰 tween 窗排空

const out = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const px = (m) => -32 * m;
  const res = { lvKeys: Object.keys(lv), gKeys: Object.keys(g).filter((k) => /mech|device|level/i.test(k)) };
  res.roots = { "lv.MechManager": lv.MechManager ? Object.keys(lv.MechManager) : null, "g.MechManager": g.MechManager ? Object.keys(g.MechManager) : null };
  // 机关设备扫描（照 o25a p4d 手法）
  const dev = [];
  const seen = new Set();
  const scan = (obj, path, depth) => {
    if (!obj || depth > 4 || seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) { obj.forEach((e, i) => scan(e, `${path}[${i}]`, depth + 1)); return; }
    if (typeof obj === "object") {
      if (obj.options && obj.options.type !== undefined) {
        const e = { path, type: obj.options.type, gid: obj.options.gid, keys: Object.keys(obj), optKeys: Object.keys(obj.options) };
        if (obj.platform) {
          const pd = obj.platform.body?.data;
          e.platform = { x: obj.platform.x, y: obj.platform.y, hasBody: !!obj.platform.body, hasData: !!pd };
          if (pd) {
            const p = pd.GetPosition(), v = pd.GetLinearVelocity();
            e.bodyPx = { x: +px(p.x).toFixed(2), y: +px(p.y).toFixed(2), vx: +px(v.x).toFixed(2), vy: +px(v.y).toFixed(2) };
          }
        }
        if (obj.sprite) e.sprite = { x: obj.sprite.x, y: obj.sprite.y };
        if (obj.state !== undefined) e.state = obj.state;
        if (obj.running !== undefined) e.running = obj.running;
        if (obj.group !== undefined) e.group = obj.group;
        dev.push(e);
      }
      for (const k2 of Object.keys(obj)) { try { scan(obj[k2], `${path}.${k2}`, depth + 1); } catch { /* skip */ } }
    }
  };
  scan(g.MechManager, "g.MechManager", 0);
  res.devices = dev;
  // 角色站位
  const grab = (p) => {
    const d = p.body.data, pos = d.GetPosition(), v = d.GetLinearVelocity();
    return { x: +px(pos.x).toFixed(2), y: +px(pos.y).toFixed(2), vx: +px(v.x).toFixed(2), vy: +px(v.y).toFixed(2), mass: +d.GetMass().toFixed(5) };
  };
  res.wg = grab(lv.pers2); res.fb = grab(lv.pers1);
  res.paused = g.physics.box2d.paused; res.state = g.state.current;
  return res;
});
log(JSON.stringify(out).slice(0, 3000));

// P3 初态运动监测：连测 2s（未翻杆时平台是否有自主运动）
const p3track = await page.evaluate(async () => {
  const g = window.Phaser.GAMES[0];
  const px = (m) => -32 * m;
  // 从设备里抓 platform 句柄集：用 MechManager deviceGroups
  const out = [];
  const grab = () => {
    const arr = [];
    const scan = (obj, depth) => {
      if (!obj || depth > 4) return;
      if (Array.isArray(obj)) { obj.forEach((e) => scan(e, depth + 1)); return; }
      if (typeof obj === "object") {
        if (obj.options && obj.options.type === "platform" && obj.platform?.body?.data) {
          const p = obj.platform.body.data.GetPosition();
          arr.push({ opt: { ...obj.options }, x: +px(p.x).toFixed(2), y: +px(p.y).toFixed(2) });
        }
        for (const k of Object.keys(obj)) { try { scan(obj[k], depth + 1); } catch {} }
      }
    };
    scan(g.MechManager, 0);
    return arr;
  };
  for (let i = 0; i < 8; i++) { out.push({ t: i * 250, ps: grab() }); await new Promise((r) => setTimeout(r, 250)); }
  return out;
});
out.p3track = p3track;
writeFileSync(join(HERE, "p0-inspect.json"), JSON.stringify(out, null, 1));
log("saved p0-inspect.json");
await browser.close();

/** p0b：设备坐标/属性详表 + P3(group3 platform) 体位置与 fixture AABB + 初态运动追踪。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p0b] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const px = (m) => -32 * m;
  const res = { devices: [], p3: {} };
  const bodyInfo = (dev) => {
    const d = dev.body?.data;
    if (!d) return null;
    const p = d.GetPosition(), v = d.GetLinearVelocity();
    const info = { x: +px(p.x).toFixed(2), y: +px(p.y).toFixed(2), vx: +px(v.x).toFixed(2), vy: +px(v.y).toFixed(2), angle: +d.GetAngle().toFixed(4), type: d.GetType() /* 0 static 1 kinematic 2 dynamic */ };
    // fixture 形状顶点
    try {
      let f = d.GetFixtureList(), n = 0;
      while (f && n < 4) {
        const s = f.GetShape();
        const sh = { GetType: s.GetType ? s.GetType() : null };
        try {
          const vc = s.GetVertexCount ? s.GetVertexCount() : null;
          if (vc != null) {
            const vs = s.GetVertices();
            sh.count = vc; sh.vertsPx = [];
            for (let i = 0; i < vc; i++) sh.vertsPx.push([+px(vs[i].x).toFixed(2), +px(vs[i].y).toFixed(2)]);
          } else if (s.GetRadius) { sh.radiusM = +s.GetRadius().toFixed(4); sh.radiusPx = +(32 * s.GetRadius()).toFixed(2); }
        } catch (e2) { sh.err = String(e2).slice(0, 100); }
        try {
          const flt = f.GetFilterData ? f.GetFilterData() : null;
          if (flt) sh.filter = { categoryBits: flt.categoryBits, maskBits: flt.maskBits };
        } catch {}
        (info.fixtures ??= []).push(sh);
        f = f.GetNext(); n++;
      }
    } catch (e) { info.fixErr = String(e).slice(0, 200); }
    return info;
  };
  for (const [gid, arr] of Object.entries(g.MechManager.deviceGroups)) {
    for (const dev of arr) {
      res.devices.push({ group: +gid, type: dev.options?.type, gid: dev.options?.gid, x: dev.options?.x, y: dev.options?.y, props: dev.options?.properties ?? null, state: dev.state, body: bodyInfo(dev) });
    }
  }
  return res;
});
log(JSON.stringify(out, null, 1));
writeFileSync(join(HERE, "p0b-devices.json"), JSON.stringify(out, null, 1));

// P3 初态运动：抓 group3 的 platform，2 秒内每 250ms 采样
const track = await page.evaluate(async () => {
  const g = window.Phaser.GAMES[0];
  const px = (m) => -32 * m;
  const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
  const out = [];
  for (let i = 0; i < 8; i++) {
    const p = p3.body.data.GetPosition(), v = p3.body.data.GetLinearVelocity();
    out.push({ t: i * 250, x: +px(p.x).toFixed(2), y: +px(p.y).toFixed(2), vx: +px(v.x).toFixed(2), st: p3.state });
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
});
out.p3track = track;
writeFileSync(join(HERE, "p0b-devices.json"), JSON.stringify(out, null, 1));
log("p3track: " + JSON.stringify(track));
await browser.close();

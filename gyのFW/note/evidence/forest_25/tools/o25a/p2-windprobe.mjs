/**
 * p2-windprobe：oracle 风机器实机参数取证。
 * 读 wind 设备 body 位置/角度、options.properties（length/rotation/group）、初始 state，
 * 并在 wg 静置台上时读 3 个时刻的 sin 相位，供解析墙位计算与 05号档引用。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p2] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForTimeout(4000);

const out = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const winds = (lv.objects || []).filter?.((o) => o?.options?.properties && o.constructor?.name) || [];
  // objects 数组元素结构未知，宽松扫描：找有 body.data 且 options.type/classNames wind 的
  const found = [];
  const scan = (arr, tag) => {
    if (!Array.isArray(arr)) return;
    for (const o of arr) {
      if (!o || typeof o !== "object") continue;
      const opt = o.options;
      const isWind =
        (opt && (String(opt.type || "").includes("wind") || (opt.properties && opt.properties.length != null && o.body && o.body.data && o.body.data.GetPosition && !o.sprite?.character))) ||
        (o.windEffect != null);
      if (isWind) {
        const p = o.body?.data?.GetPosition ? o.body.data.GetPosition() : null;
        const op = opt?.properties || {};
        found.push({
          tag,
          type: opt?.type ?? null,
          cls: o.constructor?.name ?? null,
          bodyPos_m: p ? [+p.x.toFixed(3), +p.y.toFixed(3)] : null,
          bodyPos_px: p ? [+(-32 * p.x).toFixed(1), +(-32 * p.y).toFixed(1)] : null,
          angle: o.body?.data?.GetAngle ? +o.body.data.GetAngle().toFixed(4) : o.body?.data?.m_transform?.rotation?.toFixed?.(4) ?? null,
          options_keys: opt ? Object.keys(opt) : null,
          properties: op,
          rotationOpt: opt?.rotation ?? null,
          running: o.running ?? null,
          state: o.state ?? null,
          x: o.x ?? null,
          y: o.y ?? null,
        });
      }
    }
  };
  scan(lv.objects, "level.objects");
  const mm = g.MechManager;
  let mech = null;
  if (mm?.deviceGroups) {
    mech = Object.entries(mm.deviceGroups).map(([k, v]) => ({ group: k, n: v.length, kinds: v.map((d) => d.constructor?.name) }));
  }
  const wg = lv.pers2;
  const wp = wg.body.data.GetPosition();
  const mass = wg.body.data.GetMass ? wg.body.data.GetMass() : null;
  return {
    found,
    mech,
    gravity: (() => { const gr = g.physics.box2d.gravity; return { x: gr.x, y: gr.y }; })(),
    wgMass: mass,
    wgPos_px: [+(-32 * wp.x).toFixed(1), +(-32 * wp.y).toFixed(1)],
    wgDamping: wg.body.data.m_linearDamping,
    timeNow: g.time.now,
    objectsN: Array.isArray(lv.objects) ? lv.objects.length : typeof lv.objects,
  };
});
log(JSON.stringify(out, null, 1));
writeFileSync(join(HERE, "p2-windprobe.json"), JSON.stringify(out, null, 1));
await browser.close();

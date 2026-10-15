/**
 * p4-lever：摆杆-压杆关风路线探针（forest_25 的疑似设计解）。
 *
 * 链路：wg 西落 → 水架 [640,736] 浮起 → 西跳出水面 → 落绿台 [352,864]@878 →
 *       跳登摆 bob(688,744.1)（登乘需 ~121.5px 升，峰值 123——边距 ~1.5px）→
 *       持 A 西压泵摆 → 目标：bob/wg 推杆 lever l0 (盒 [459,469]×[440,485]，west 弧点 440) →
 *       杆过竖直→ state 翻转 → group4 风关 → 验证 wind.running=false。
 * 产出：p4-lever.json（bob x_min、lever/wind 状态时间线、登乘成功率）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p4] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForTimeout(5000);
log("in");

const sleep = (ms) => page.waitForTimeout(ms);
const st = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const rp = (p) => { if (!p?.body) return null; const r = p.body.data.GetPosition(); const v = p.body.data.GetLinearVelocity(); return { x: +(-32 * r.x).toFixed(1), y: +(-32 * r.y).toFixed(1), vx: +(-32 * v.x).toFixed(1), vy: +(-32 * v.y).toFixed(1) }; };
    let lever = null, wind = null, bob = null;
    const groups = lv.MechManager?.deviceGroups ?? g.MechManager?.deviceGroups ?? {};
    for (const grp of Object.values(groups)) {
      for (const d of grp) {
        const t = d.options?.type;
        if (t === "wind") wind = { running: d.running, state: d.state };
        else if (t === "hanging") bob = { x: +(d.bob?.x ?? d.sprite?.x ?? NaN).toFixed(1), y: +(d.bob?.y ?? d.sprite?.y ?? NaN).toFixed(1) };
        else if (d.joint && d.options?.properties?.onis != null) lever = { state: d.state, angle: +(d.joint.GetJointAngleRadians?.() ?? 0).toFixed(3), onis: d.options.properties.onis };
      }
    }
    return { wg: rp(lv.pers2), fb: rp(lv.pers1), wind, lever, bob, st: g.state.current, paused: g.physics.box2d.paused };
  });

// 阶段1：西行跌落
await page.keyboard.down(WG.left);
const t0 = Date.now();
while (Date.now() - t0 < 9000) {
  const s = await st();
  if (!s.wg || s.st !== "level") { await page.keyboard.up(WG.left); break; }
  if (s.wg.y > 150) break;
  await sleep(25);
}
await page.keyboard.up(WG.left);
log("fell off west edge");

// 阶段2：水面西漂至 x<628（西跳出水面）
await page.keyboard.down(WG.left);
await page.keyboard.down(WG.up);
await sleep(60);
await page.keyboard.up(WG.up);
const t1 = Date.now();
let offWater = false;
while (Date.now() - t1 < 6000) {
  const s = await st();
  if (!s.wg || s.st !== "level") break;
  if (s.wg.x < 628) { offWater = true; break; }
  await sleep(30);
}
await page.keyboard.up(WG.left);
log(`offWater=${offWater}`);
// 下落至绿台（站位 842.6）；若挂大板东缘（站位 412.6）则东走出缘再落
let onGreen = false;
const t2 = Date.now();
while (Date.now() - t2 < 8000) {
  const s = await st();
  if (!s.wg || s.st !== "level") break;
  if (s.wg.y > 820 && s.wg.y < 860 && Math.abs(s.vy) < 20) { onGreen = true; break; }
  if (s.wg.y > 390 && s.wg.y < 430 && Math.abs(s.vy) < 20) {
    await page.keyboard.down(WG.right);
    await sleep(700);
    await page.keyboard.up(WG.right);
  }
  await sleep(40);
}
log(`onGreen=${onGreen} wg=${JSON.stringify((await st()).wg)}`);

// 阶段3：定位 x~688，跳登 bob（多次尝试）
await page.keyboard.down(WG.right);
while (true) {
  const s = await st();
  if (!s.wg || s.st !== "level") break;
  if (s.wg.x >= 676) break;
  await sleep(25);
}
await page.keyboard.up(WG.right);
await sleep(250);
let boarded = false;
const boardTrace = [];
for (let att = 0; att < 8 && !boarded; att++) {
  for (let i = 0; i < 20; i++) {
    const s = await st();
    if (Math.abs(s.wg.x - 688) < 5) break;
    if (s.wg.x < 683) { await page.keyboard.down(WG.right); await sleep(30); await page.keyboard.up(WG.right); }
    else if (s.wg.x > 693) { await page.keyboard.down(WG.left); await sleep(30); await page.keyboard.up(WG.left); }
    await sleep(20);
  }
  await page.keyboard.down(WG.up);
  await sleep(60);
  await page.keyboard.up(WG.up);
  const tj = Date.now();
  while (Date.now() - tj < 1200) {
    const s = await st();
    boardTrace.push({ t: Date.now() - tj, ...s.wg });
    if (!s.wg) break;
    if (s.wg.y > 670 && s.wg.y < 712 && Math.abs(s.vy) < 25) { boarded = true; break; }
    await sleep(30);
  }
  log(`board try ${att}: ${boarded} wg=${JSON.stringify((await st()).wg)}`);
  if (!boarded) await sleep(400);
}
log(`boarded=${boarded}`);

// 阶段4：泵摆——持 A + 周期跳，目标 bob 西摆推杆
let bobXMin = 999;
const leverLog = [];
if (boarded) {
  await page.keyboard.down(WG.left);
  const tp = Date.now();
  while (Date.now() - tp < 30000) {
    await page.keyboard.down(WG.up);
    await sleep(50);
    await page.keyboard.up(WG.up);
    await sleep(450);
    const s = await st();
    if (s.bob) bobXMin = Math.min(bobXMin, s.bob.x);
    leverLog.push({ t: Date.now() - tp, bob: s.bob, lever: s.lever, wind: s.wind, wg: s.wg });
    if (s.wind && s.wind.running === false) { log("WIND OFF!"); break; }
    if (s.st !== "level") break;
  }
  await page.keyboard.up(WG.left).catch(() => {});
}
const fin = await st();
const out = { boarded, bobXMin, fin, leverLog: leverLog.filter((_, i) => i % 3 === 0), boardTrace };
writeFileSync(join(HERE, "p4-lever.json"), JSON.stringify(out, null, 1));
log(`FINAL ${JSON.stringify({ boarded, bobXMin, wind: fin.wind, lever: fin.lever, wg: fin.wg, st: fin.st })}`);
await browser.close();

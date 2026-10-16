/** p3c-bodies：全世界刚体普查（wg 房区域）+ wg@x=1000 / wg@x=700 的接触链与 fixture 圆参数。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p3c] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(1200);

// 世界句柄探测
const worldKeys = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const b2 = g.physics.box2d;
  return { b2keys: Object.keys(b2).slice(0, 40), hasWorld: !!b2.world, worldProto: b2.world ? Object.getOwnPropertyNames(Object.getPrototypeOf(b2.world)).filter((k) => /body|contact/i.test(k)).slice(0, 20) : null };
});
log("world: " + JSON.stringify(worldKeys));

const dumpAll = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const px = (m) => -32 * m;
  const w = g.physics.box2d.world;
  const bodies = [];
  let b = w.GetBodyList ? w.GetBodyList() : (w.m_bodyList ?? null);
  let n = 0;
  while (b && n < 500) {
    const p = b.GetPosition();
    const bx = px(p.x), by = px(p.y);
    const info = { i: n, x: +bx.toFixed(1), y: +by.toFixed(1), type: b.GetType(), ud: null, shapes: [] };
    try { const u = b.GetUserData ? b.GetUserData() : b.userdata; if (u != null) info.ud = typeof u === "object" ? (u.constructor?.name ?? "obj") : String(u); } catch {}
    try { info.phaser = !!(b.owner || b.sprite); } catch {}
    let f = b.GetFixtureList();
    let fn = 0;
    while (f && fn < 3) {
      const s = f.GetShape();
      const sh = { t: s.GetType() };
      try {
        if (s.m_vertices && s.m_count) {
          // 多边形：世界坐标 = body 位置 + 顶点（角度 0 近似；记录局部即可）
          sh.verts = [];
          for (let i = 0; i < s.m_count; i++) sh.verts.push([+px(s.m_vertices[i].x).toFixed(1), +px(s.m_vertices[i].y).toFixed(1)]);
          sh.worldVerts = sh.verts.map(([vx, vy]) => [+(bx + vx).toFixed(1), +(by + vy).toFixed(1)]);
        } else if (s.m_radius != null) {
          sh.r = +px(s.m_radius).toFixed(2);
          if (s.m_p) sh.off = [+px(s.m_p.x).toFixed(2), +px(s.m_p.y).toFixed(2)];
        }
      } catch (e) { sh.err = String(e).slice(0, 80); }
      info.shapes.push(sh);
      f = f.GetNext(); fn++;
    }
    bodies.push(info);
    b = b.GetNext ? b.GetNext() : b.m_next;
    n++;
  }
  return bodies;
});
log("total bodies: " + dumpAll.length);
// wg 房区域 x[640,1160] y[560,900] 内或与之相关的体（顶点世界坐标判定）
const region = dumpAll.filter((b) => {
  const xs = [];
  const ys = [];
  for (const s of b.shapes) {
    for (const v of s.worldVerts ?? []) { xs.push(v[0]); ys.push(v[1]); }
    if (s.r) { xs.push(b.x - s.r, b.x + s.r); ys.push(b.y - s.r, b.y + s.r); }
  }
  if (!xs.length) { xs.push(b.x); ys.push(b.y); }
  return Math.max(...xs) >= 640 && Math.min(...xs) <= 1160 && Math.max(...ys) >= 560 && Math.min(...ys) <= 900;
});
log("region bodies: " + region.length);
writeFileSync(join(HERE, "p3c-bodies-all.json"), JSON.stringify(dumpAll, null, 1));
writeFileSync(join(HERE, "p3c-bodies-region.json"), JSON.stringify(region, null, 1));

// wg 置于 x=1000 与 x=700，dump 接触链 + fixture 圆
const contactProbe = [];
for (const x of [1000, 700]) {
  await page.evaluate((xx) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -860.54 / 32 });
  }, x);
  await sleep(800);
  const c = await page.evaluate((xx) => {
    const g = window.Phaser.GAMES[0];
    const px = (m) => -32 * m;
    const wb = g.level.pers2.body.data;
    const p = wb.GetPosition(), v = wb.GetLinearVelocity();
    const shapes = [];
    let f = wb.GetFixtureList();
    while (f) {
      const s = f.GetShape();
      shapes.push({ r: +px(s.m_radius).toFixed(2), off: s.m_p ? [+px(s.m_p.x).toFixed(2), +px(s.m_p.y).toFixed(2)] : null });
      f = f.GetNext();
    }
    const contacts = [];
    let ce = wb.GetContactList ? wb.GetContactList() : wb.m_contactList;
    let n = 0;
    while (ce && n < 10) {
      const other = ce.other;
      const op = other ? other.GetPosition() : null;
      let oud = null;
      try { const u = other.GetUserData ? other.GetUserData() : other.userdata; oud = u == null ? null : (typeof u === "object" ? (u.constructor?.name ?? "obj") : String(u)); } catch {}
      contacts.push({ touching: ce.contact ? ce.contact.IsTouching() : null, other: { x: op ? +px(op.x).toFixed(1) : null, y: op ? +px(op.y).toFixed(1) : null, ud: oud } });
      ce = ce.next; n++;
    }
    return { x: xx, wg: { x: +px(p.x).toFixed(2), y: +px(p.y).toFixed(2), vy: +px(v.y).toFixed(3), awake: wb.IsAwake() }, shapes, contacts };
  }, x);
  contactProbe.push(c);
  log(`x=${x}: ${JSON.stringify(c)}`);
}
writeFileSync(join(HERE, "p3c-contacts.json"), JSON.stringify(contactProbe, null, 1));
await browser.close();

/**
 * p6c-warmup：验证"暖身破冻结"假说——冻结只在特定 x（700/656）作为会话首个 tp 时触发；
 * p4b 首tp=788 从未冻结，p4-sweep 中段 x=700 20 试全安。
 * 会话A：fullSetup → tp(788) 暖身（仅落定）→ tp(700) → 跳 → 分析。
 * 会话B（对照）：fullSetup → tp(700) 直接 → 跳（预期冻结）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p6c] ${m}`);
const FLOOR_CORE = 860.54;
let browser, page, sampler;

const sleep = (ms) => page.waitForTimeout(ms);
const readWorld = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const lv = g.level;
    const px = (m) => -32 * m;
    const grab = (p) => {
      if (!p || !p.body || !p.body.data) return null;
      const d = p.body.data, pos = d.GetPosition(), v = d.GetLinearVelocity();
      if (!pos) return null;
      return { x: +px(pos.x).toFixed(2), y: +px(pos.y).toFixed(2), vx: +(px(v.x)).toFixed(2), vy: +(px(v.y)).toFixed(2), awake: d.IsAwake() };
    };
    const grp = g.MechManager?.deviceGroups?.[3];
    const lever = grp?.find((d) => d.options?.type === "lever");
    const p3 = grp?.find((d) => d.options?.type === "platform");
    const pp = p3?.body?.data?.GetPosition();
    return { st: g.state.current, wg: grab(lv?.pers2), fb: grab(lv?.pers1), lever: lever ? lever.state : null, p3x: pp ? +px(pp.x).toFixed(2) : null, paused: g.physics.box2d.paused };
  });

const tpWg = async (x, y0 = FLOOR_CORE) => {
  await page.evaluate(({ xx, yy }) => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers2.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -xx / 32, y: -yy / 32 });
  }, { x, y: y0 });
  for (let i = 0; i < 30; i++) {
    await sleep(50);
    const s = await readWorld();
    if (!s.wg) return null;
    if (!s.wg.awake || (s.wg.vy === 0 && Math.abs(s.wg.y - y0) < 0.6 && Math.abs(s.wg.x - x) < 2.5)) return s.wg;
  }
  return (await readWorld()).wg;
};

const fullSetup = async () => {
  const st = await page.evaluate(() => window.Phaser.GAMES[0].state.current);
  if (st !== "level") throw new Error("not level at session start");
  await page.evaluate(() => { window.Phaser.GAMES[0].level.retry(); });
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    return g.state.current === "level" && !!g.level?.pers1 && !!g.level?.pers2 && g.level.levelStarted;
  }, { timeout: 30000 });
  await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
  await sleep(2500);
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers1.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -470 / 32, y: -668.8 / 32 });
  });
  await sleep(500);
  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    const lever = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "lever");
    return lever.state === 1;
  }, { timeout: 8000 });
  await sleep(300);
  await page.keyboard.up("ArrowLeft").catch(() => {});
  await page.waitForFunction(() => {
    const g = window.Phaser.GAMES[0];
    const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
    const v = p3.body.data.GetLinearVelocity();
    return Math.abs(-32 * v.x) < 0.5 && -32 * p3.body.data.GetPosition().x > 690;
  }, { timeout: 8000 });
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const d = g.level.pers1.body.data;
    d.SetAwake(true);
    d.SetLinearVelocity({ x: 0, y: 0 });
    d.SetPosition({ x: -1010 / 32, y: -508.8 / 32 });
  });
  await sleep(600);
  const w = await readWorld();
  if (!(w.wg && w.lever === 1 && Math.abs((w.p3x ?? 0) - 700.26) <= 2)) throw new Error("fullSetup verify fail: " + JSON.stringify(w));
};

const analyze = (y0, tr) => {
  const ws = tr.filter((s) => s.wg);
  if (!ws.length) return { empty: true };
  let minY = 9999, jumped = false;
  for (const s of ws) { if (s.wg.vy < -100) jumped = true; if (s.wg.y < minY) minY = s.wg.y; }
  const end = ws[ws.length - 1];
  return { jumped, minY: +minY.toFixed(2), rise: +(y0 - minY).toFixed(2), rest: [end.wg.x, end.wg.y] };
};

const jumpOnce = async (tag) => {
  await sampler.drain();
  await page.keyboard.down(WG.up);
  await sleep(35);
  await page.keyboard.up(WG.up);
  await sleep(1600);
  const w = await readWorld();
  if (!w.wg || w.st !== "level") throw new Error(`${tag}: post-jump broken st=${w.st} wg=${JSON.stringify(w.wg)} paused=${w.paused}`);
  const tr = await sampler.drain();
  return { tag, ...analyze(FLOOR_CORE, tr), endSt: w.st };
};

async function session(name, fn) {
  ({ browser, page } = await openGame());
  await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
  await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
  await page.waitForTimeout(4000);
  sampler = await attachSampler(page);
  let out;
  try { await fullSetup(); out = await fn(); }
  catch (e) {
    const w = await readWorld().catch(() => null);
    out = { session: name, fail: String(e).slice(0, 150), world: w };
  }
  log(`${name}: ${JSON.stringify(out).slice(0, 260)}`);
  try { await browser.close(); } catch {}
  return out;
}

const rA = await session("A-warmup788-then700", async () => {
  const warm = await tpWg(788);
  if (!warm) throw new Error("warmup tp fail");
  await sleep(400);
  const stand = await tpWg(700);
  if (!stand) throw new Error("tp700 after warmup fail");
  return { ...(await jumpOnce("A jump@700")), standY: +stand.y.toFixed(2) };
});

const rB = await session("B-direct700", async () => {
  const stand = await tpWg(700);
  if (!stand) throw new Error("direct tp700 fail");
  return { ...(await jumpOnce("B jump@700")), standY: +stand.y.toFixed(2) };
});

const rC = await session("C-warmup788-then656", async () => {
  const warm = await tpWg(788);
  if (!warm) throw new Error("warmup tp fail");
  await sleep(400);
  const stand = await tpWg(656);
  if (!stand) throw new Error("tp656 after warmup fail");
  return { ...(await jumpOnce("C jump@656")), standY: +stand.y.toFixed(2) };
});

writeFileSync(join(HERE, "p6c-warmup.json"), JSON.stringify([rA, rB, rC], null, 1));
log(`A=${JSON.stringify(rA).slice(0, 120)}`);
log(`B=${JSON.stringify(rB).slice(0, 120)}`);
log(`C=${JSON.stringify(rC).slice(0, 120)}`);
process.exit(0);

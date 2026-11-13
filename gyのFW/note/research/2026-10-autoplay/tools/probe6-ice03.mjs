// probe6-ice03.mjs — G1 wg 走墩轨迹细察（fw-route-ice03 槽）。
// 复现 chain G1 c1 的 wg 前缀，逐 10f 打印 wg/puck 状态，定位卡点。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const botcore = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/botcore.mjs")).href);
const { makeWorld } = kernel;
const { S } = botcore;

const progWg = [
  S.walkTo ? null : null, // placeholder（walkTo 是 autosearch 自制件，本地重写同式）
].filter(Boolean);

// walkTo 同 autosearch PRIM_TABLE 实现
const walkTo = (d, xLine, vMax = 70) => {
  const D = d > 0 ? "right" : "left", O = d > 0 ? "left" : "right";
  return {
    name: `walk${d}${xLine}`,
    run: (c) => {
      const past = d > 0 ? c.me.x >= xLine : c.me.x <= xLine;
      if (!past) return Math.abs(c.me.vx) > vMax ? { ...botcore.NONE } : { ...botcore.NONE, [D]: true };
      const overshoot = d > 0 ? c.me.vx > 20 : c.me.vx < -20;
      return overshoot ? { ...botcore.NONE, [O]: true } : { ...botcore.NONE };
    },
    done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) && Math.abs(c.me.vx) <= 20 && c.me.grounded,
  };
};
// wrapTap 同 autosearch PRIM_TABLE（up 展宽 25f + done 锁存修复）
const wrapTap = (stp) => { const orig = stp.run.bind(stp); let jAt = -1, airAfter = false;
  stp.run = (ctx) => { if (ctx.f <= 1) return botcore.NONE;
    const inp = orig(ctx) || botcore.NONE;
    if (inp.up) { jAt = ctx.f; }
    else if (jAt >= 0 && ctx.f <= jAt + 24) { inp.up = true; }
    if (jAt >= 0 && !ctx.me.grounded) airAfter = true;
    return inp; };
  stp.done = (c) => jAt >= 0 && airAfter && c.me.grounded && c.me.vy >= -8;
  return stp; };
const jd = (dir, holdF) => wrapTap(botcore.S.jumpDrift(dir > 0 ? "right" : "left", 0, holdF));

const w = makeWorld("ice_03");
const wgProg = [
  { name: "sleep3", run: () => botcore.NONE, done: (c) => c.f >= 3 },
  walkTo(-1, 1120, 70), jd(-1, 18), jd(-1, 14), walkTo(-1, 880, 70), jd(-1, 25), walkTo(-1, 465, 70),
  botcore.S.hold("right", (c) => c.me.x >= 552)];
let idx = 0;
const NONE = { ...botcore.NONE };
let inp = { ...NONE };
for (let f = 0; f < 900; f++) {
  const stp = wgProg[idx];
  if (stp) {
    const me0 = w.snapshotPlayer("watergirl");
    const me = { ...me0, grounded: w.players.watergirl.feetContacts.length > 0 };
    const ctx = { f, w, me, other: w.snapshotPlayer("fireboy"), mem: (stp._mem ??= {}), jumpHeld: inp.up };
    inp = stp.run(ctx);
    if (stp.done(ctx)) { idx++; console.log(`  [idx->${idx}] f${f} ${stp.name ?? "?"}`); }
  }
  w.step(1 / 60, { fireboy: NONE, watergirl: inp });
  if (f % 10 === 0) {
    const s = w.snapshotPlayer("watergirl");
    const M = w.mechSnapshot();
    console.log(`f${f} idx=${idx} wg=[${s.x.toFixed(1)},${s.y.toFixed(1)}] vx=${s.vx.toFixed(0)} puck=${M.sliders[0].x.toFixed(1)} inp=${JSON.stringify(inp)}`);
  }
  const s2 = w.snapshotPlayer("watergirl");
  if (s2.dead || s2.dying) { console.log(`DEAD f${f}`); break; }
}

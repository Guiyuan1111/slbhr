// rimjump.mjs — L1 验证：C0 驻点 → 东拉 830 → 全速西跑 → runJump(-1,795) 越酸落干台 [576,624]@192
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S } from "../../../../../scripts/e2e/routetool/botcore.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
function walkTo(d, xLine, vMax = 999) {
  const D = d > 0 ? "right" : "left", O = d > 0 ? "left" : "right";
  return {
    name: `w${d}${xLine}`,
    run: (c) => {
      const past = d > 0 ? c.me.x >= xLine : c.me.x <= xLine;
      if (!past) return Math.abs(c.me.vx) > vMax ? NONE : { ...NONE, [D]: true };
      const overshoot = d > 0 ? c.me.vx > 20 : c.me.vx < -20;
      return overshoot ? { ...NONE, [O]: true } : NONE;
    },
    done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) && Math.abs(c.me.vx) <= 20 && c.me.grounded,
  };
}
function sleep(n) { let t = 0; return { name: `s${n}`, run: () => NONE, done: () => ++t >= n }; }
function spec2prim(p) {
  const a = p.a ?? [];
  switch (p.n) {
    case "sleep": return sleep(a[0]);
    case "walkTo": return walkTo(a[0], a[1], a[2] ?? 999);
    default: throw new Error(`unknown spec ${p.n}`);
  }
}
// runJump 包装（对齐 autosearch：up 保持 holdF + f0 护栏 + 离地落地 done）
function runJump(d, line, holdF = 6) {
  const stp = S.runJump(d > 0 ? "right" : "left", line);
  const orig = stp.run.bind(stp);
  let jumpedAt = -1, airAfter = false;
  stp.run = (ctx) => {
    if (ctx.f <= 1) return NONE;
    const inp = orig(ctx);
    if (inp.up) jumpedAt = ctx.f;
    else if (jumpedAt >= 0 && ctx.f <= jumpedAt + holdF - 1) inp.up = true;
    if (jumpedAt >= 0 && !ctx.me.grounded) airAfter = true;
    return inp;
  };
  stp.done = (c) => jumpedAt >= 0 && airAfter && c.me.grounded;
  return stp;
}

const st = JSON.parse(readFileSync(join(ROOT, "note/research/2026-10-autoplay/tools/crystal04-probes/state-crystal04.json"), "utf8"));
const seedFb = st.segs[0].final.sf.map(spec2prim), seedWg = st.segs[0].final.sw.map(spec2prim);

const TAKE = Number(process.env.TAKE ?? 795);
const prog = [
  walkTo(1, 830, 999),      // 东拉（离开滑坡驻点）到 830
  runJump(-1, TAKE, 6),     // 全速西跑，到 TAKE 起跳越酸
  sleep(400),               // 落地后静置观察
];
const { drive } = await import("file://" + join(ROOT, "scripts/e2e/routetool/botcore.mjs"));
const w = makeWorld("../../../data/crystal/levels/crystal_04");
const r = drive(w, { fb: [...seedFb, ...prog], wg: [...seedWg, ...prog] }, 900, { traceAll: true });
console.log(`result=${JSON.stringify(r.result)}`);
let last = "";
for (const t of r.trace) {
  if (t.f % 6) continue;
  const row = `f${t.f} fb[${t.fb[0].toFixed(1)},${(t.fb[1] + 35.5).toFixed(1)}] wg[${t.wg[0].toFixed(1)},${(t.wg[1] + 35.5).toFixed(1)}]`;
  if (row !== last) { console.log(row); last = row; }
}
const lastT = r.trace[r.trace.length - 1];
console.log(`END f${lastT.f} fb[${lastT.fb[0].toFixed(1)},${(lastT.fb[1] + 35.5).toFixed(1)}] wg[${lastT.wg[0].toFixed(1)},${(lastT.wg[1] + 35.5).toFixed(1)}]`);

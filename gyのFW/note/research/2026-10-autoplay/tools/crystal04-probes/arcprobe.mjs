// arcprobe.mjs — 跳跃弧 vx 实测（fb/wg 独立 prim 实例，避免共享闭包）
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
function mkProg(seedSpecs) {
  // 每次调用产出全新 prim 实例（seed 深拷贝 + 新后缀）
  const seed = seedSpecs.map(spec2prim);
  return [...seed, walkTo(1, 830, 999), S.runJump("left", 795), sleep(400)];
}
const st = JSON.parse(readFileSync(join(ROOT, "note/research/2026-10-autoplay/tools/crystal04-probes/state-crystal04.json"), "utf8"));
const sfSpecs = st.segs[0].final.sf, swSpecs = st.segs[0].final.sw;
const progFb = mkProg(sfSpecs), progWg = mkProg(swSpecs);
// 探针：仅 fb 的 runJump（第 4 个 prim，index 3）
const rj = progFb[4];
{
  const origRun = rj.run.bind(rj);
  rj.run = (c) => {
    const i = origRun(c);
    if (c.f >= 285 && c.f <= 370) console.log(`ARC f${c.f} x=${c.me.x.toFixed(1)} vx=${c.me.vx.toFixed(2)} g=${c.me.grounded ? 1 : 0} inp=${JSON.stringify(i)}`);
    return i;
  };
}
const { drive } = await import("file://" + join(ROOT, "scripts/e2e/routetool/botcore.mjs"));
const w = makeWorld("../../../data/crystal/levels/crystal_04");
const r = drive(w, { fb: progFb, wg: progWg }, 900, {});
console.log(`result=${JSON.stringify(r.result)}`);

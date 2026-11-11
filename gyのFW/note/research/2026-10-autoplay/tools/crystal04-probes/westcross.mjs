// westcross.mjs — 决定性实验：驻点 → 东扶正 772 → jumpDrift(-1,0,900) 全程持向越酸
//   → 干台 [576,624]@192 → jumpOnto(left,~150) 上西高原 [128,560]@144 → 西行穿 obj64 带(231)
//   → P5 传送 413.7 落中板西段 —— 验证「可达世界」是否包含任何目标物
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
const mk = (seedSpecs) => [
  ...seedSpecs.map(spec2prim),
  walkTo(1, 772, 70),          // 东扶正到 772（离开滑坡驻点，站在实体平板沿）
  S.jumpDrift("left", 0, 900), // 定点满充跳 + 全程持 left 越酸
  sleep(20),
  S.jumpOnto("left", 150),     // 干台上原地上跳，过 y150 后压 left 漂上西高原
  walkTo(-1, 231, 999),        // 西行穿 obj64 带 → P5 传送
  sleep(300),
];
const st = JSON.parse(readFileSync(join(ROOT, "note/research/2026-10-autoplay/tools/crystal04-probes/state-crystal04.json"), "utf8"));
const progFb = mk(st.segs[0].final.sf), progWg = mk(st.segs[0].final.sw);
const { drive } = await import("file://" + join(ROOT, "scripts/e2e/routetool/botcore.mjs"));
const w = makeWorld("../../../data/crystal/levels/crystal_04");
const r = drive(w, { fb: progFb, wg: progWg }, 1200, { traceAll: true });
console.log(`result=${JSON.stringify(r.result)}`);
let last = "";
for (const t of r.trace) {
  if (t.f % 20) continue;
  const row = `f${t.f} fb[${t.fb[0].toFixed(0)},${(t.fb[1] + 35.5).toFixed(0)}] wg[${t.wg[0].toFixed(0)},${(t.wg[1] + 35.5).toFixed(0)}]`;
  if (row !== last) { console.log(row); last = row; }
}
const lastT = r.trace[r.trace.length - 1];
console.log(`END f${lastT.f} fb[${lastT.fb[0].toFixed(1)},${(lastT.fb[1] + 35.5).toFixed(1)}] wg[${lastT.wg[0].toFixed(1)},${(lastT.wg[1] + 35.5).toFixed(1)}]`);

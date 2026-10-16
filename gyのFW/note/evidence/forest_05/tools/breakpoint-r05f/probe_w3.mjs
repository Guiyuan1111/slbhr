// probe_w3: W3 起跳几何实证——fb 翻杆2驻东，wg 走到 714 短按 L 起跳，逐帧回放
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, drive } from "../../../scripts/e2e/routetool/botcore.mjs";

for (const tapF of [4, 6, 8, 12]) {
  const w = makeWorld("forest_05");
  const fbSteps = [
    S.settle("落定"),
    S.hold("right", (c) => c.me.x >= 465 && c.me.grounded, "东行"),
    S.runJump("right", 450, "S1跳P3西"),
    S.wait((c) => c.me.grounded && c.me.y < 830 && c.me.x > 504, "P3西确认"),
    S.goTo(548, 4, "S2走位"),
    S.hold("left", (c) => c.me.x <= 543 && c.me.grounded, "S2退步"),
    { name: "S2跳", run: (c) => { c._p = (c._p || 0) + 1; return { ...NONE, left: c._p <= 52, up: c._p === 7 }; }, done: (c) => c.me.grounded && c.me.y < 745 && c.me.x < 500 },
    { name: "穿杆2", run: (c) => ({ ...NONE, left: true }), done: (c) => c.w.mechSnapshot().levers[1].state === 1 && c.me.x <= 412 },
    { name: "等P3驻东", run: () => NONE, done: (c) => c.w.mechSnapshot().platforms[2].x >= 698 },
    { name: "完", run: () => NONE, done: () => false },
  ];
  const wgSteps = [
    S.settle("落定"),
    S.hold("left", (c) => c.me.x <= 715 && c.me.grounded, "西行714"),
    { name: "驻停", run: () => NONE, done: (c) => Math.abs(c.me.vx) < 5 && c.me.grounded },
    { name: `L短按${tapF}f`, run: (c) => { c._t = (c._t || 0) + 1; return { ...NONE, left: c._t <= tapF, up: c._t === 1 }; }, done: (c) => c._t > tapF + 90 },
  ];
  const r = drive(w, { fb: fbSteps, wg: wgSteps }, 600, { traceAll: true });
  const tr = r.trace;
  const jf = tr.find((s) => s.f > 0 && s.wgv[1] < -300)?.f ?? 0;
  console.log(`\n=== tapF=${tapF} wg起跳帧≈${jf}`);
  for (const s of tr) {
    if (jf && s.f >= jf - 1 && s.f <= jf + 46 && (s.f + jf) % 2 === 0)
      console.log(`f${s.f} wg=(${s.wg[0].toFixed(1)},${s.wg[1].toFixed(1)}) v=(${s.wgv[0].toFixed(0)},${s.wgv[1].toFixed(0)})`);
  }
  const ls = tr[tr.length - 1];
  console.log(`末帧 wg=(${ls.wg[0].toFixed(1)},${ls.wg[1].toFixed(1)})`);
}

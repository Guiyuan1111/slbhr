// pb.mjs — wg 东坠道柱梯探针: S1-S10 分段
// 用法: node --import tsx pb.mjs [case]
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const run = (name, evs, total = 400, marks = []) => {
  const st = { left: false, right: false, up: false };
  const byF = new Map();
  for (const e of evs) { if (!byF.has(e.f)) byF.set(e.f, []); byF.get(e.f).push(e); }
  const w = makeWorld("forest_29");
  const pts = [];
  let out = "";
  for (let f = 0; f < total; f++) {
    for (const e of byF.get(f) ?? []) st[e.dir] = e.type === "down";
    w.step(1 / 60, { fireboy: st, watergirl: { ...st } });
    const s = w.snapshotPlayer("watergirl");
    pts.push([+s.x.toFixed(1), +s.y.toFixed(1)]);
    if (s.dead) { out = `DEAD@f${f}`; break; }
    if (w.phase === "won") { out = `WIN@f${f}`; break; }
  }
  const ms = marks.filter(i => i < pts.length);
  console.log(`${name}: ${out || "alive"}  ${ms.map(i => `f${i}(${pts[i]})`).join(" ")}`);
  return pts;
};
const hold = (f1, f2, d) => [{ f: f1, dir: d, type: "down" }, { f: f2, dir: d, type: "up" }];
const jmp = (f, d, air) => { const e = [{ f, dir: "up", type: "down" }, { f: f + air, dir: "up", type: "up" }]; if (d) e.push({ f, dir: d, type: "down" }, { f: f + air, dir: d, type: "up" }); return e; };

const C = process.argv[2] || "all";
const doCase = (n, fn) => { if (C === "all" || C === n) fn(); };
const M = (evs) => Math.max(...evs.map(e => e.f)) + 60;

// S1: 东行走出板缘(1152) → 柱A(1152-1184, y640)
doCase("S1", () => run("S1 东走出缘", hold(2, 130, "right"), 200, [100, 115, 130, 140, 150, 160, 180]));
// S1b: 东行到缘停, 再点东走出
doCase("S1b", () => run("S1b 东行停+走出", [...hold(2, 108, "right"), ...hold(118, 124, "right")], 200, [108, 120, 126, 135, 145, 160, 180]));
// S2: S1落A后 西走出缘 → 柱B(1120-1152, y832)
doCase("S2", () => run("S2 A西走出", [...hold(2, 108, "right"), ...hold(130, 190, "left")], 260, [115, 125, 135, 150, 170, 200, 230]));
// S3: B西走出 → 柱C(1088-1120, y736)
doCase("S3", () => run("S3 A-B-C 西走出链", [...hold(2, 108, "right"), ...hold(130, 200, "left")], 300, [130, 160, 200, 230, 250, 270, 290]));
// S4: C上西跳 → D(x960-1024, y768) — 变air
for (const [n, jf, air, ew] of [["S4a", 260, 24, 28], ["S4b", 264, 30, 32], ["S4c", 268, 36, 36], ["S4d", 272, 42, 40]]) {
  doCase(n, () => run(`${n} C缘西跳air${air}`, [...hold(2, 108, "right"), ...hold(130, jf - 1 - ew, "left"), ...jmp(jf, "left", air)], 360, [jf, jf + 20, jf + 40, jf + 60, jf + 80, jf + 110]));
}

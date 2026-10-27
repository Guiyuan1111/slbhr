// r15f 网格扫描：对指定事件做 ±K 帧独立伸缩扫描（串行小工具，不与 optimizer 抢核）
// 报告每个 delta 的 内核结论 + 终局位置，用于定位"停点裕度"刀锋的鲁棒岛。
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/gridscan.mjs [route路径] "wg#70=-6..6|wg#71=-6..6" [probeF,probeF...]
// 语法: side#idx=lo..hi （闭区间）；多段用 | 分隔；probe 帧列表（逗号分隔）额外输出该帧 wg 位置
import { readFileSync } from "node:fs";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const path = process.argv[2] ?? "scripts/e2e/inputs/routes/forest_15.json";
const spec = process.argv[3] ?? "";
const probes = (process.argv[4] ?? "").split(",").filter(Boolean).map(Number);
const doc = JSON.parse(readFileSync(path, "utf8"));

function runWith(mods) {
  const mk = (side) => doc[side].map((e, i) => {
    const d = mods.get(side + "#" + i);
    return d === undefined || d === 0 ? { ...e } : { ...e, f: e.f + d };
  });
  const tr = [];
  const res = runKernel(doc.level, { ...doc, fb: mk("fb"), wg: mk("wg") }, { traceTo: tr });
  const last = tr[Math.min(doc.totalFrames - 1, tr.length - 1)];
  const pr = probes.map((f) => {
    const t = tr[Math.min(f, tr.length - 1)];
    return `@f${f}:wg(${t.wg[0] | 0},${t.wg[1] | 0})`;
  }).join(" ");
  return { won: res.won, deathF: res.deathF, winF: res.winF, end: `wg(${last.wg[0] | 0},${last.wg[1] | 0}) fb(${last.fb[0] | 0},${last.fb[1] | 0})`, pr };
}

for (const seg of spec.split("|").filter(Boolean)) {
  const m = seg.match(/^(fb|wg)#(\d+)=(-?\d+)\.\.(-?\d+)$/);
  if (!m) { console.error(`bad spec: ${seg}`); process.exit(2); }
  const [, side, idxS, loS, hiS] = m;
  const idx = Number(idxS), lo = Number(loS), hi = Number(hiS);
  console.log(`== ${side}#${idx} nominal f${doc[side][idx].f} ${doc[side][idx].dir}-${doc[side][idx].type}`);
  for (let d = lo; d <= hi; d++) {
    const mods = new Map([[`${side}#${idx}`, d]]);
    const r = runWith(mods);
    console.log(`  ${d >= 0 ? "+" : ""}${d}: ${r.won ? `WIN@f${r.winF}` : r.deathF < 0 ? "TIMEOUT" : `DEAD@f${r.deathF}`} end=${r.end} ${r.pr}`);
  }
}

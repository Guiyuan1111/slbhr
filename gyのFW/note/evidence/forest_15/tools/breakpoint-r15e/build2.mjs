// build2: v41 = v40 fb 链 (已验证到门) + wg 全名义链 (仅 F1)
// 依据 j3b/j3f 实测: v40 fb 的 b3/p6 时序与 v39 完全一致 → wg #54-85 可整段原样保留
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const base = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const EV = (f, dir, type) => ({ f, dir, type });
const sortByF = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

const fbOld = base.fb;
const fbNew = [
  ...fbOld.slice(0, 18).map(e => ({ ...e })),
  EV(3520, "right", "down"), EV(3590, "right", "up"),
  EV(3594, "left", "down"), EV(3628, "left", "up"),
  EV(3636, "up", "down"), EV(3651, "up", "up"),
  EV(3638, "left", "down"),
  EV(3774, "left", "up"),
  EV(4200, "left", "down"), EV(4305, "left", "up"),
  EV(4560, "right", "down"), EV(4578, "right", "up"),
  EV(4680, "right", "down"), EV(4683, "up", "down"), EV(4698, "up", "up"),
  EV(4820, "right", "up"),
  EV(4870, "left", "down"), EV(4873, "up", "down"), EV(4888, "up", "up"),
  ...fbOld.slice(39).map(e => ({ ...e })),
];

const wgOld = base.wg;
const wgNew = [
  ...wgOld.slice(0, 15).map(e => ({ ...e })),
  EV(1154, "left", "up"),   // F1: 短按停臂锚 (原 f1160)
  ...wgOld.slice(16).map(e => ({ ...e })),  // #16-85 全名义 (12↑E 及下游原样)
];

const doc = {
  level: base.level, tickHz: base.tickHz, totalFrames: base.totalFrames,
  source: "v41 (r15e, 2026-10-14): fb G5 链重建(东墙立定跳/b2 带/row16 东跳/p6 西面 pin 12↑W) + wg 全名义链(仅 F1 短按臂锚); 实测 v40 fb 的 b3/p6 时序=v39 → wg 无需重排",
  fb: sortByF(fbNew), wg: sortByF(wgNew),
};
writeFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v41.json"), JSON.stringify(doc, null, 1));
console.log("fb:", doc.fb.length, "wg:", doc.wg.length);

const tr = [];
const res = runKernel("forest_15", doc, { traceTo: tr });
console.log(`nominal: won=${res.won} winF=${res.winF ?? "-"} deathF=${res.deathF}`);
const last = tr[tr.length - 1];
console.log(`END f${last.f} fb(${last.fb[0].toFixed(0)},${last.fb[1].toFixed(0)}) wg(${last.wg[0].toFixed(0)},${last.wg[1].toFixed(0)})`);
for (const f of [4950, 5033, 5062, 5100, 6200, 6993, 7500, 7900]) {
  const r = tr[f];
  console.log(`  f${f} fb(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)}) wg(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`);
}

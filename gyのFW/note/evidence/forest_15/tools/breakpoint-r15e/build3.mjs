// build3: v42 = v41 + 簇1 修复 (wg#37 停点西移) + endgame 锚定 (G1E 钉墙后长西行)
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
const wgNew = [];
for (let i = 0; i < wgOld.length; i++) {
  const e = wgOld[i];
  if (i === 15) { wgNew.push(EV(1154, "left", "up")); continue; }          // F1
  if (i === 37) { wgNew.push(EV(3498, "right", "up")); continue; }         // 簇1: 东行停点西移 45px (烟囱口 margin 15→60px)
  if (i === 76) {                                                          // endgame: 落地后先东行钉墙
    wgNew.push(EV(7075, "right", "down"));                                 // 东行 (从 ~810 到东墙)
    wgNew.push(EV(7165, "right", "up"));                                   // 钉墙 x~1186 (硬锚)
    wgNew.push(EV(7300, "left", "down"));                                  // 长西行 (559px ≈ 130f)
    wgNew.push(EV(7434, "left", "up"));                                    // 释放 → 滑行停 ~x620 (待实测校正)
    continue;
  }
  if (i === 77) continue;                                                  // 旧 63f 西行删除 (被上行替代)
  wgNew.push({ ...e });
}

const doc = {
  level: base.level, tickHz: base.tickHz, totalFrames: base.totalFrames,
  source: "v42 (r15e): v41 + wg#37 停点西移45px(烟囱口) + endgame G1E 钉墙锚定(东行1186→长西行→620)",
  fb: sortByF(fbNew), wg: sortByF(wgNew),
};
writeFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v42.json"), JSON.stringify(doc, null, 1));
console.log("fb:", doc.fb.length, "wg:", doc.wg.length);

const tr = [];
const res = runKernel("forest_15", doc, { traceTo: tr });
console.log(`nominal: won=${res.won} winF=${res.winF ?? "-"} deathF=${res.deathF}`);
for (const f of [3490, 3560, 7040, 7165, 7430, 7490, 7530, 7560, 7700, 7900]) {
  const r = tr[f];
  console.log(`  f${f} fb(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)}) wg(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`);
}

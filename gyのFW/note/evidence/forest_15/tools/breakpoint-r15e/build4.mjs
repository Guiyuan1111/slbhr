// build4: v43 = v41 + 三根因修复
//  A. wg#37 f3508→3513: G6 东行停点 1089→~1111 (烟囱 [1072,1138] 居中, 抖动容差 ±28)
//  B. wg#42 插入 b2 全压 60f (p3 滑足 192+ 清出 fb row16 跳身位; p4 反向同率无碰撞)
//  C. wg#56 f5030→5024: 12↑E tap 3f→9f (抖动后 tap ∈ [6,12] 远离 0-fail 边界)
//  D. endgame: G1E 落地东行钉墙 1186 → 长西行 → 停 ~620 (方差 ±35→±13)
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
  if (i === 15) { wgNew.push(EV(1154, "left", "up")); continue; }   // F1
  if (i === 37) { wgNew.push(EV(3513, "right", "up")); continue; }  // A
  if (i === 42) {                                                   // B: b2 全压插入
    wgNew.push(EV(3615, "left", "down"));
    wgNew.push(EV(3692, "left", "up"));                             // 停于板心 ~543
    wgNew.push(EV(3752, "left", "down"));                           // 60f 后继续西行
    continue;
  }
  if (i === 56) { wgNew.push(EV(5024, "right", "down")); continue; }// C
  if (i === 76) {                                                   // D
    wgNew.push(EV(7075, "right", "down"));
    wgNew.push(EV(7165, "right", "up"));                            // 钉墙 1186
    wgNew.push(EV(7300, "left", "down"));
    wgNew.push(EV(7431, "left", "up"));                             // 长西行释放 (待实测校正)
    continue;
  }
  if (i === 77) continue;
  wgNew.push({ ...e });
}

const doc = {
  level: base.level, tickHz: base.tickHz, totalFrames: base.totalFrames,
  source: "v43 (r15e): A wg#37+5f 烟囱居中 / B b2 全压60f p3清出 / C 12↑E tap 9f / D endgame 钉墙锚定",
  fb: sortByF(fbNew), wg: sortByF(wgNew),
};
writeFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v43.json"), JSON.stringify(doc, null, 1));
console.log("fb:", doc.fb.length, "wg:", doc.wg.length);

const tr = [];
const res = runKernel("forest_15", doc, { traceTo: tr });
console.log(`nominal: won=${res.won} winF=${res.winF ?? "-"} deathF=${res.deathF}`);
for (const f of [3500, 3520, 3560, 3695, 3735, 5030, 5062, 7040, 7165, 7435, 7495, 7530, 7560, 7900]) {
  const r = tr[f];
  console.log(`  f${f} fb(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)}) wg(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)})`);
}

// build1: v39 → v40 硬化路线 (F1-F5 结构归一)
// 输出: scripts/e2e/inputs/routes/forest_15.json (写 .v40.json 先行验证, 不覆盖)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const EV = (f, dir, type) => ({ f, dir, type });
const sortByF = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

// ============ WG ============
// 分段重排: 0-14 不变; 15 retimed (F1); 16-54 不变; 55-59 重排 (F3); 60-61 删; 62-77 不变;
// 78-80 retimed (F4); 81 不变; 82-83 retimed; 84 不变; 85 retimed (F5)
const wgOld = base.wg;
const wgNew = [
  ...wgOld.slice(0, 15).map(e => ({ ...e })),
  EV(1154, "left", "up"),                      // F1: 短按停臂锚 (原 f1160)
  ...wgOld.slice(16, 54).map(e => ({ ...e })), // #16-53 不变 (f1210..f4510)
  EV(4950, "left", "down"),                    // #54 不变
  EV(5060, "left", "up"),                      // F3: p6 东面 pin (原 f5020)
  EV(5062, "right", "down"),                   // F3: pin 后东移 14f
  EV(5076, "up", "down"),                      // F3: 12↑E from x~666
  EV(5091, "up", "up"),
  EV(5210, "right", "up"),                     // F3: 右按穿飞行+落地东行, 一次松 (删旧 #59-61)
  ...wgOld.slice(62, 78).map(e => ({ ...e })), // #62-77 不变 (f6200..f7493)
  EV(7496, "up", "down"),                      // F4: 缘跳 (原 f7515)
  EV(7511, "up", "up"),
  EV(7575, "left", "up"),                      // #80 不变
  EV(7600, "left", "down"),                    // #82 不变
  EV(7660, "left", "up"),                      // 重排: 落点 420 系
  EV(7700, "right", "down"),                   // #84 不变
  EV(7720, "right", "up"),                     // F5: 门带 nudge 20f
];

// ============ FB ============
// 0-17 不变; 18-25 重排 (F2b); 26-27 retimed (F2 pin); 28-35 重排 (F2 jump); 36+ 平移映射
const fbOld = base.fb;
const fbNew = [
  ...fbOld.slice(0, 18).map(e => ({ ...e })),  // #0-17 不变 (f20..f3450)
  EV(3520, "right", "down"),                   // F2b: 东行
  EV(3590, "right", "up"),                     // F2b: 东墙 pin x1186
  EV(3594, "left", "down"),                    // F2b: 西行 34f
  EV(3628, "left", "up"),                      // F2b: 停 (杀 vx)
  EV(3636, "up", "down"),                      // F2b: 立定西跳 (x~1104, 洞定理 vx≈0)
  EV(3651, "up", "up"),
  EV(3638, "left", "down"),                    // F2b: 立即左舵穿飞行
  EV(3774, "left", "up"),                      // F2b: 停于 b2 带 x~532 (对齐名义, 下游 +29px 会出 b3 带)
  EV(4200, "left", "down"),                    // b2 释 (不变; 停点 x116 ∈ b3 带 [50,142] 压 b3 → p6 升 → wg 东穿 G4)
  EV(4305, "left", "up"),                      // 停 x~116 (名义不变; 中心须 ∈ [50,142])
  EV(4560, "right", "down"),                   // F2: 东行走位 (出带 ~f4575 → b3 释 → p6 降)
  EV(4578, "right", "up"),                     // F2: 停于 x~152 (槽净空: 起跳身位东缘须 ≤~176)
  EV(4680, "right", "down"),                   // F2: 3f 微助跑 (p3 清出后 ≥f4640)
  EV(4683, "up", "down"),                      // F2: row16 东跳 + 空中右舵 (名义配方)
  EV(4698, "up", "up"),
  EV(4820, "right", "up"),                     // F2: 右舵穿飞行(名义67f)+落地东行至 p6 西面 pin x594
  EV(4870, "left", "down"),                    // 12↑W from p6 pin (不变)
  EV(4873, "up", "down"),
  EV(4888, "up", "up"),
  ...fbOld.slice(39).map(e => ({ ...e })),     // #39+ 不变 (f4940..f7885)
];

const doc = {
  level: base.level, tickHz: base.tickHz, totalFrames: base.totalFrames,
  source: "v40 (r15e, 2026-10-14): F1-F5 结构归一硬化 (l1 短按臂锚/fb 东墙+西墙 pin 跳/wg p6 面 pin+东移 14f/缘跳/门带 20f nudge); 基于 v39 kernel WIN @f7936",
  fb: sortByF(fbNew), wg: sortByF(wgNew),
};
writeFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v40.json"), JSON.stringify(doc, null, 1));
console.log("fb:", doc.fb.length, "wg:", doc.wg.length);

/**
 * rotcheck·eval-align：对 final-b/final-c.json 的 θ 序列做采样对齐分账。
 * 背景：oracle 采样器包 StateManager.update（场景更新后、物理 Step 前，lib.mjs attachSampler
 * 同位约定）→ 采样点相对内核 runKernel（w.step 后采样）差一个 tick。本脚本对同位/移位两种
 * 对齐各算一遍残差并输出大残差帧清单，用于裁定物理面是否位级同源。
 * 用法：在 gyのFW 根目录 node TEMP/rotcheck/eval-align.mjs（先跑 scen-final.mjs 产出数据）。
 */
import { readFileSync } from "node:fs";

const D2G = 180 / Math.PI;
for (const tag of ["b", "c"]) {
  const d = JSON.parse(readFileSync(`TEMP/rotcheck/final-${tag}.json`, "utf8"));
  const rows = d.rows;
  const n = rows.length;
  const flat = (f) => rows.flatMap(f);
  const absmax = (a) => Math.max(...a.map(Math.abs), 0);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  // 同位对齐：oracle[i] vs kernel[i]
  const same = flat((r) => r.dAng).map((v) => Math.abs(v) * D2G);
  // 移位对齐：oracle[i+1] vs kernel[i]（oracle 采样落后一个 tick）与反向对照
  const sh1 = [];
  const sh2 = [];
  const spikes = [];
  for (let i = 0; i + 1 < n; i++) {
    for (let j = 0; j < rows[i].dAng.length; j++) {
      sh1.push(Math.abs(rows[i + 1].ang[j] - rows[i].kAng[j]) * D2G);
      sh2.push(Math.abs(rows[i].ang[j] - rows[i + 1].kAng[j]) * D2G);
    }
    const m = Math.max(...rows[i].dAng.map(Math.abs)) * D2G;
    if (m > 0.01) spikes.push({ f: i, dAngDeg: +m.toFixed(4) });
  }
  console.log(`[${tag}] n=${n} loseAt=${d.stats.loseAt}`);
  console.log(`  sameIdx : maxDeg=${absmax(same).toFixed(6)} medianDeg=${med(same).toFixed(6)}`);
  console.log(`  shift+1 : maxDeg=${absmax(sh1).toFixed(6)} medianDeg=${med(sh1).toFixed(6)}  (oracle[i+1] vs kernel[i])`);
  console.log(`  shift-1 : maxDeg=${absmax(sh2).toFixed(6)} medianDeg=${med(sh2).toFixed(6)}  (oracle[i] vs kernel[i+1])`);
  console.log(`  sameIdx >0.01deg 帧: ${JSON.stringify(spikes)}`);
  const sPersSame = flat((r) => [r.dPers]);
  console.log(`  sameIdx dPers: max=${absmax(sPersSame).toFixed(6)}px median=${med(sPersSame).toExponential(3)}px dXY: max=${absmax(flat((r) => r.dXY)).toFixed(6)}px`);
}

// j1probe: 复现 trial7 抖动 (fb#15 f3388+2, wg#13 f1010+1), 密采 wg fb f1090-1360 每4帧
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const F0 = Number(process.argv[2] ?? 1090), F1 = Number(process.argv[3] ?? 1360);
const STEP = Number(process.argv[4] ?? 4);

function build(jits) {
  const mod = (side) => doc[side].map((e, i) => jits[side + i] ? { ...e, f: e.f + jits[side + i] } : { ...e });
  return { ...doc, fb: mod("fb"), wg: mod("wg") };
}

const cases = [
  ["nominal", {}],
  ["wg13+1", { wg13: 1 }],
  ["wg11+1", { wg11: 1 }],
  ["wg10+1", { wg10: 1 }],
  ["wg13+2", { wg13: 2 }],
  ["wg13+3", { wg13: 3 }],
];
for (const [name, jits] of cases) {
  const tr = [];
  const res = runKernel("forest_15", build(jits), { traceTo: tr });
  const lines = [];
  for (let f = F0; f <= F1; f += STEP) {
    const r = tr[f];
    if (!r) break;
    lines.push(`f${f} wg(${r.wg[0].toFixed(0)},${r.wg[1].toFixed(0)}) fb(${r.fb[0].toFixed(0)},${r.fb[1].toFixed(0)})`);
  }
  console.log(`== ${name} won=${res.won} deathF=${res.deathF}`);
  console.log(lines.join("\n"));
}

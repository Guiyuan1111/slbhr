// s25.mjs — 轨迹细查：柱脚落定后的西行
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
const ev = (f, dir, type) => ({ f, dir, type });

const trace = [];
runKernel("forest_03_1", {
  fb: [],
  wg: [ev(3, "left", "down"), ev(164, "up", "down"), ev(174, "up", "up")],
  totalFrames: 400,
}, { traceTo: trace });

for (let f = 180; f < 400; f += 4) {
  const p = trace[f]?.wg;
  if (p) console.log(`f${f} (${p[0].toFixed(1)},${p[1].toFixed(1)})`);
}

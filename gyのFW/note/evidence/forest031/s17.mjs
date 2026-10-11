// s17.mjs — wg 西跳针眼细扫（jf 262-268 逐帧）：找落入 WATER22 的窗口
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

for (let jf = 262; jf <= 268; jf++) {
  const ev = [
    { f: 80, dir: "left", type: "down" },
    { f: jf, dir: "up", type: "down" },
    { f: jf + 7, dir: "up", type: "up" },
  ];
  const trace = [];
  const res = runKernel("forest_03_1", { fb: [], wg: ev, totalFrames: 500 }, { traceTo: trace });
  // wg 关键轨迹
  const pts = [];
  for (let f = jf; f < Math.min(trace.length, jf + 90); f += 6) {
    const p = trace[f]?.wg;
    if (p) pts.push(`f${f}(${p[0].toFixed(0)},${p[1].toFixed(0)})`);
  }
  const last = trace[trace.length - 1]?.wg;
  console.log(`jf=${jf} dead=${res.deathF >= 0}@${res.deathF} END(${last?.[0].toFixed(0)},${last?.[1].toFixed(0)})`);
  console.log("   ", pts.join(" "));
}

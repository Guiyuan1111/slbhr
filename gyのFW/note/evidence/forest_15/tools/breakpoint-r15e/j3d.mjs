// j3d: N=14 与 N=20 的跳跃段逐帧轨迹对比
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const v40 = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json.v40.json"), "utf8"));
const sortBy = (arr) => [...arr].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
function build(N) {
  const wg = v40.wg.map(e => ({ ...e }));
  const i57 = wg.findIndex(e => e.f === 5076);
  const i58 = wg.findIndex(e => e.f === 5091);
  wg[i57].f = 5062 + N + 2;
  wg[i58].f = 5062 + N + 17;
  return { ...v40, wg: sortBy(wg) };
}
for (const N of [8, 14, 20, 24]) {
  const tr = [];
  const jf = 5064 + N; // 起跳帧
  runKernel("forest_15", build(N), { traceTo: tr });
  console.log(`=== N=${N} jump@f${jf} ===`);
  for (let f = jf; f <= jf + 36; f += 2) {
    const r = tr[f];
    const east = (r.wg[0] + 14).toFixed(0);
    console.log(`  t${f - jf} f${f} wg(${r.wg[0].toFixed(1)},${r.wg[1].toFixed(1)}) eastEdge=${east}`);
  }
}

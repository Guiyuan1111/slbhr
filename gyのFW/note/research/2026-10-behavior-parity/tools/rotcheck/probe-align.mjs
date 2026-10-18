import { runOracle, runKernel, templeId } from "./rotlib.mjs";

const levelFile = "forest/levels/forest_02.json";
const levelId = templeId(levelFile);
console.log(`forest_02 id=${levelId}`);

console.log("oracle idle 180f ...");
const o = await runOracle({ levelId, levelFile, frames: 180 });
console.log(`oracle 采样=${o.samples.length} e头=${o.samples.slice(0, 5).map((s) => s.e).join(",")} marks=${JSON.stringify(o.marks)}`);

console.log("kernel idle 180f（实录 dt 回放）...");
const k = await runKernel({ level: "forest_02", frames: 180, dtMs: o.samples.map((s) => s.e) });

let maxPers = 0, maxHang = 0;
for (let i = 0; i < Math.min(o.samples.length, k.length); i++) {
  const os = o.samples[i], ks = k[i];
  const dp = Math.max(Math.abs(os.fb[0] - ks.fb[0]), Math.abs(os.fb[1] - ks.fb[1]), Math.abs(os.wg[0] - ks.wg[0]), Math.abs(os.wg[1] - ks.wg[1]));
  const dh = Math.max(...os.hang.flatMap((h, j) => [Math.abs(h[0] - ks.hang[j][0]), Math.abs(h[1] - ks.hang[j][1]), Math.abs(h[2] - ks.hang[j][2])]));
  if (dp > maxPers) maxPers = dp;
  if (dh > maxHang) maxHang = dh;
  if (i < 3 || i === 30 || i === 179) {
    console.log(`f${i}: dPers=${dp.toExponential(3)} dHang=${dh.toExponential(3)} oracleHang=${JSON.stringify(os.hang.map((h) => h.map((v) => +v.toFixed(4))))}`);
  }
}
console.log(`PROBE: maxPers=${maxPers.toExponential(4)} maxHang=${maxHang.toExponential(4)}`);

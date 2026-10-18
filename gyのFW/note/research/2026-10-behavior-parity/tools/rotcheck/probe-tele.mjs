import { runOracle, runKernel, templeId } from "./rotlib.mjs";

const levelFile = "forest/levels/forest_02.json";
const id = templeId(levelFile);
const acts = [{ f: 60, role: "pers1", x: 435.2, y: 340 }];
const o = await runOracle({ levelId: id, levelFile, frames: 70, actions: acts, drainEvery: 100 });
const k = await runKernel({ level: "forest_02", frames: 70, dtMs: o.samples.map((s) => s.e), actions: acts });
for (let i = 55; i < 66; i++) {
  const os = o.samples[i], ks = k[i];
  console.log(`f${i}: oracle fb=(${os.fb[0].toFixed(3)},${os.fb[1].toFixed(3)}) vy=${os.fb[3].toFixed(3)} | kernel fb=(${ks.fb[0].toFixed(3)},${ks.fb[1].toFixed(3)}) vy=${ks.fb[3].toFixed(3)} | dy=${(os.fb[1] - ks.fb[1]).toFixed(4)} dt=${o.samples[i].e}`);
}
process.exit(0);

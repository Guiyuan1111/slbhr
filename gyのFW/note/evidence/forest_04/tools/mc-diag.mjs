// mc 失败诊断：复刻 mc.mjs 的 RNG 与 jitter，对失败 trial 加 trace 找卡死/死亡位点
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel, makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";

const LEVEL = process.argv[2] || "forest_04";
const N = Number(process.argv[3] || 150);
const SEED = Number(process.argv[4] || 42);

let s = SEED >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;
  if (r < 0.026) return 2;
  if (r < 0.028) return 3;
  return 0;
}

const doc = JSON.parse(readFileSync(join("scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
const jitter = (arr) => arr
  .map(e => { const d = slip(); return d ? { ...e, f: e.f + d } : e; })
  .sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

const w2 = makeWorld(LEVEL); // 关卡几何参考（找最近地面）
for (let i = 0; i < N; i++) {
  const fbj = jitter(doc.fb), wgj = jitter(doc.wg);
  const slipped = [];
  fbj.forEach((e, k) => { if (e.f !== doc.fb[k].f) slipped.push(`FB#${k} f${doc.fb[k].f}→${e.f} ${e.dir}/${e.type}`); });
  wgj.forEach((e, k) => { if (e.f !== doc.wg[k].f) slipped.push(`WG#${k} f${doc.wg[k].f}→${e.f} ${e.dir}/${e.type}`); });
  const trace = [];
  const res = runKernel(LEVEL, { ...doc, fb: fbj, wg: wgj }, { traceTo: trace });
  if (res.won) continue;
  const last = trace[trace.length - 1];
  const lastPh = last?.ph;
  // 找最后静止段（死亡/卡死前最后 60 帧位置）
  const tail = trace.slice(-90).filter((_, k) => k % 15 === 0).map(t => `f${t.f} fb(${t.fb[0].toFixed(0)},${t.fb[1].toFixed(0)}) wg(${t.wg[0].toFixed(0)},${t.wg[1].toFixed(0)})`).join(" | ");
  console.log(`trial${i} ${res.deathF < 0 ? "STUCK" : "death@" + res.deathF} ph=${lastPh} slip=[${slipped.join(", ")}]`);
  console.log(`   tail: ${tail}`);
}

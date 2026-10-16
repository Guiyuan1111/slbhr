// mcprobe: 复刻 mc.mjs 抖动，找首个失败 trial，带 trace 回放定位滞留点
// 用法: cd gyのFW && node --import tsx ../TEMP/r05g2/mcprobe.mjs [--seed 42] [--trial 0] [--n 12]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel, makeWorld, expandFlat } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const argOf = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d; };
const SEED = Number(argOf("seed", "42"));
const TRIAL = Number(argOf("trial", "0"));
const N = Number(argOf("n", "1"));
const LEVEL = "forest_05";

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

for (let i = 0; i < N; i++) {
  const fbj = jitter(doc.fb), wgj = jitter(doc.wg);
  if (i !== TRIAL) {
    const res = runKernel(LEVEL, { ...doc, fb: fbj, wg: wgj }, {});
    console.log(`trial ${i}: ${JSON.stringify(res)}`);
    continue;
  }
  // trace 回放
  const trace = [];
  const ins = expandFlat(fbj, wgj, doc.totalFrames);
  const w = makeWorld(LEVEL);
  let out = null;
  const slips = { fb: fbj.filter((e, j) => e.f !== doc.fb[j]?.f).length, wg: wgj.filter((e, j) => e.f !== doc.wg[j]?.f).length };
  console.log(`trial ${TRIAL} 抖动事件数: fb=${slips.fb}/${doc.fb.length} wg=${slips.wg}/${doc.wg.length}`);
  for (let f = 0; f < doc.totalFrames; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    trace.push({ f, fb: [fb.x, fb.y], wg: [wg.x, wg.y] });
    if (fb.dead || wg.dead || fb.dying || wg.dying) { out = { deathF: f }; break; }
    if (w.phase === "won") { out = { winF: f }; break; }
    if (f === doc.totalFrames - 1) out = { stall: true };
  }
  console.log(`trial ${TRIAL} result:`, JSON.stringify(out));
  const last = trace[trace.length - 1];
  console.log(`末帧 fb=(${last.fb[0].toFixed(1)},${last.fb[1].toFixed(1)}) wg=(${last.wg[0].toFixed(1)},${last.wg[1].toFixed(1)})`);
  // wg 每隔 20 帧的轨迹（后半程）
  for (let f = Math.floor(trace.length * 0.75); f < trace.length; f += 10) {
    const t = trace[f];
    console.log(`f${f} fb=(${t.fb[0].toFixed(0)},${t.fb[1].toFixed(0)}) wg=(${t.wg[0].toFixed(0)},${t.wg[1].toFixed(0)})`);
  }
}

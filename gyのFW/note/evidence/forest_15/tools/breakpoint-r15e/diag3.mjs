// diag3: MC 失败 trial 终态聚类 (致死关节分析, 非 first-divergence)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));
const N = Number(process.argv[2] ?? 60);
let s = 42 >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function slip() {
  const r = rand();
  if (r < 0.02) return 1;
  if (r < 0.026) return 2;
  if (r < 0.028) return 3;
  return 0;
}
const jitter = (arr) => arr.map(e => { const d = slip(); return d ? { ...e, f: e.f + d } : { ...e }; })
  .sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));

const clusters = new Map();
let wins = 0;
for (let t = 0; t < N; t++) {
  const fb = jitter(doc.fb), wg = jitter(doc.wg);
  const tr = [];
  const res = runKernel("forest_15", { ...doc, fb, wg }, { traceTo: tr });
  if (res.won) { wins++; continue; }
  const last = tr[tr.length - 1];
  // 终态桶: 按 x 粗分类
  const zone = (x, y) => {
    if (y < 200) return x < 260 ? "G1-W-door" : "G1-E";
    if (y < 340) return x < 640 ? "G2-W" : "G2-E";
    if (y < 460) return x < 640 ? "G3-W" : "G3-E";
    if (y < 590) return x < 656 ? "G4-W" : "G4-E";
    if (y < 720) return x < 640 ? "G5-W" : "G5-E";
    if (y < 800) return x < 640 ? "G6-W" : "G6-E";
    return x < 512 ? "BOT-W" : x < 736 ? "BOT-MID" : "BOT-E";
  };
  const key = `fb:${zone(last.fb[0], last.fb[1])} wg:${zone(last.wg[0], last.wg[1])}`;
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push(t);
}
console.log(`wins ${wins}/${N}`);
for (const [k, v] of [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(v.length).padStart(3)}  ${k}   trials=[${v.slice(0, 12).join(",")}${v.length > 12 ? ",..." : ""}]`);
}

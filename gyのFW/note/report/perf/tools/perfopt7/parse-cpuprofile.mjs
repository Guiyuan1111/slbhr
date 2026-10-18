/**
 * r7a cpuprofile 火焰解析（perfopt7）：把 --cpu-prof 的 .cpuprofile 聚成面桶 + top 自采样函数。
 * 判读警示：V8 CPU profiler 有 SIGPROF 自代价（r6b 已识别：stime +7.5% 量级），桶份额用于
 * 相对构成判读，不与无 profiler 跑的绝对 CPU 混用。
 *
 * 用法：node note/report/perf/tools/perfopt7/parse-cpuprofile.mjs --in <file.cpuprofile> --out <label>
 * 产物：--out 给了就写 benchmark/results/attrib-r7-prof-<label>.json（含桶与 top30）
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const IN = argOf("in");
const OUT = argOf("out");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
if (!IN) { console.error("用法: --in <cpuprofile> [--out <label>]"); process.exit(1); }

const prof = JSON.parse(readFileSync(IN, "utf8"));
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const totalSamples = prof.samples.length;
const totalHits = prof.nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0);
const wallMs = (prof.endTime - prof.startTime) / 1000;

function bucketOf(fn) {
  const url = fn.callFrame.url || "";
  const name = fn.callFrame.functionName || "(anonymous)";
  if (name === "(garbage collector)") return "GC";
  if (name === "(program)") return "program(native)";
  if (name === "(idle)") return "idle";
  if (/^(V8:|v8\.)/i.test(name) || /Compile|Optimize|Deoptimiz|Deserialize|ParseJS/i.test(name)) return "v8-jit";
  if (/listOnTimeout|processTimers|node:internal\/timers/.test(name + url)) return "timers";
  if (/@colyseus[\\/]schema/.test(url)) return "colyseus-schema";
  if (/@colyseus[\\/](core|js)/.test(url)) return "colyseus-core";
  if (/[\\/]ws[\\/]|node:net|node:stream|node:_http|node:http/.test(url)) return "net-ws";
  if (/kernel|box2d|b2[A-Z]/.test(url) || /^b2[A-Z]/.test(name)) return "physics-box2d";
  if (/[\\/]packages[\\/]server[\\/]/.test(url)) return "server-rooms";
  if (/[\\/]packages[\\/]shared[\\/]/.test(url)) return "shared";
  if (/[\\/]packages[\\/]client[\\/]/.test(url)) return "client-code";
  if (/tsx|esbuild|node:internal[\\/](modules|process|bootstrap)/.test(url)) return "loader-ts";
  if (/node:internal/.test(url)) return "node-internals";
  if (/node_modules/.test(url)) return "vendor-other";
  return "other";
}

const buckets = new Map();
const byNode = [];
for (const n of prof.nodes) {
  const hits = n.hitCount ?? 0;
  if (!hits) continue;
  const b = bucketOf(n);
  buckets.set(b, (buckets.get(b) ?? 0) + hits);
  byNode.push({ hits, name: n.callFrame.functionName || "(anonymous)", url: (n.callFrame.url || "").replace(/.*node_modules\//, "nm/").replace(/.*packages\//, "pk/").slice(0, 90), bucket: b, line: n.callFrame.lineNumber });
}
byNode.sort((a, b2) => b2.hits - a.hits);

const pct = (hits) => +((hits / totalHits) * 100).toFixed(2);
const result = {
  meta: {
    file: IN, date: new Date().toISOString(),
    samplesTotal: totalSamples, hitsTotal: totalHits, wallMs: +wallMs.toFixed(0),
    note: "份额=hitCount/总 hitCount；SIGPROF 自代价在案（r6b：stime +7.5% 量级），只作构成判读",
  },
  buckets: Object.fromEntries([...buckets.entries()].sort((a, b2) => b2[1] - a[1]).map(([k, v]) => [k, pct(v)])),
  top30: byNode.slice(0, 30).map((n) => ({ ...n, pctOfSamples: pct(n.hits) })),
};
console.log(`profile: ${totalHits} hits / ${wallMs.toFixed(0)}ms wall`);
for (const [k, v] of Object.entries(result.buckets)) console.log(`  ${k.padEnd(20)} ${String(v).padStart(6)}%`);
console.log("top15:");
for (const n of result.top30.slice(0, 15)) console.log(`  ${String(n.pctOfSamples).padStart(6)}%  ${n.bucket.padEnd(16)} ${n.name}  ${n.url}:${n.line}`);
if (OUT) {
  mkdirSync(join(ROOT, "benchmark", "results"), { recursive: true });
  const fp = join(ROOT, "benchmark", "results", `attrib-r7-prof-${OUT}.json`);
  writeFileSync(fp, JSON.stringify(result, null, 2));
  console.log(`已存档 ${fp}`);
}

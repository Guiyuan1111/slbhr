// 逐帧对齐：FW_DUMP 服务器转储 vs 内核 trace，找首个分歧帧 + 前后输入
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const STEP = 1000 / 60;
const kern = JSON.parse(readFileSync(join(HERE, "kernel-trace.json"), "utf8"));
const kmap = new Map(kern.map((r) => [r.f, r]));
let sframes = [], consumes = [];
for (const line of readFileSync(join(HERE, "..", "server-dump-1.jsonl"), "utf8").split("\n")) {
  if (!line) continue;
  const r = JSON.parse(line);
  if (r.f !== undefined) sframes.push(r); else consumes.push(r);
}
sframes.sort((a, b) => a.f - b.f);
console.log(`kernel frames=${kern.length} server frames=${sframes.length} consumes=${consumes.length}`);
const TH = 1.0; // px
let first = -1;
for (const s of sframes) {
  const k = kmap.get(s.f);
  if (!k) break;
  if (Math.hypot(s.fb[0] - k.fb[0], s.fb[1] - k.fb[1]) > TH ||
      Math.hypot(s.wg[0] - k.wg[0], s.wg[1] - k.wg[1]) > TH) { first = s.f; break; }
}
console.log(`first divergence (> ${TH}px): f=${first}`);
if (first < 0) process.exit(0);
const F0 = Math.max(0, first - 6), F1 = first + 4;
for (let f = F0; f <= F1; f++) {
  const k = kmap.get(f), s = sframes.find((r) => r.f === f);
  if (!k || !s) { console.log(`f=${f} missing ${!k ? "kernel" : "server"}`); continue; }
  const dfb = (s.fb[0] - k.fb[0]).toFixed(2), dfy = (s.fb[1] - k.fb[1]).toFixed(2);
  const wgb = (s.wg[0] - k.wg[0]).toFixed(2), wgy = (s.wg[1] - k.wg[1]).toFixed(2);
  console.log(`f=${f} k.fb=(${k.fb[0].toFixed(1)},${k.fb[1].toFixed(1)}) s.fb=(${s.fb[0].toFixed(1)},${s.fb[1].toFixed(1)}) d=(${dfb},${dfy}) | k.wg=(${k.wg[0].toFixed(1)},${k.wg[1].toFixed(1)}) s.wg=(${s.wg[0].toFixed(1)},${s.wg[1].toFixed(1)}) d=(${wgb},${wgy})`);
  console.log(`   in.fb=${JSON.stringify(s.in.fb)} in.wg=${JSON.stringify(s.in.wg)}`);
}
// 分歧前的输入消费记录（意图到达时刻 at, ms 相对开钟）
const cs = consumes.filter((c) => c.consume >= F0 && c.consume <= F1 + 1);
console.log("--- consumes in window ---");
for (const c of cs) console.log(`k=${c.consume} role=${c.role} at=${c.at.toFixed(1)}ms keys=${JSON.stringify(c.keys)}`);

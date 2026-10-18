/**
 * [hotspot 槽] cpuprofile 调用者/被调者归因查询。
 * 用法：node TEMP/hotspot/callers.mjs <file.cpuprofile> <函数名子串> [方向=callers|callees]
 * 输出：该函数（含递归去重栈）的 self/incl 汇总 + 直接调用者/直接被调者分布。
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
const needle = process.argv[3];
const dir = process.argv[4] ?? "callers";
if (!file || !needle) { console.error("usage: node callers.mjs <file.cpuprofile> <fn-substr> [callers|callees]"); process.exit(1); }
const data = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of data.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const fn = (n) => `${n.callFrame.functionName || "(匿名)"} @${(n.callFrame.url || "").split("/").slice(-2).join("/") || "(eval)"}`;
const totalUs = data.timeDeltas.reduce((a, b) => a + (b > 0 ? b : 0), 0);

let targetSelf = 0, targetIncl = 0, targetHits = 0;
const agg = new Map();
for (let i = 0; i < data.samples.length; i++) {
  const dt = data.timeDeltas[i] ?? 0;
  if (dt <= 0 && i > 0) continue;
  let id = data.samples[i];
  const node = nodes.get(id);
  if (!node) continue;
  // 沿栈收集：目标节点 = 栈中匹配 needle 的最顶（叶侧）帧
  let target = null;
  {
    let cur = id;
    while (cur) {
      const nd = nodes.get(cur);
      if (nd && fn(nd).includes(needle)) { target = nd; break; }
      cur = parent.get(cur);
    }
  }
  if (!target) continue;
  targetIncl += dt;
  if (target.id === id) targetSelf += dt;
  if (dir === "callers") {
    const p = nodes.get(parent.get(target.id) ?? 0);
    if (p) { const k = fn(p); agg.set(k, (agg.get(k) ?? 0) + dt); }
  } else {
    // callees：样本栈中目标帧的下一帧（叶方向）。需要从叶往目标走：重建叶到目标的链
    const chain = [];
    let cur = id;
    while (cur && cur !== target.id) { chain.push(cur); cur = parent.get(cur); }
    if (cur === target.id) {
      const childId = chain[chain.length - 1];
      const c = nodes.get(childId);
      if (c && childId !== target.id) { const k = fn(c); agg.set(k, (agg.get(k) ?? 0) + dt); }
      else if (!chain.length) targetHits += dt;
    }
  }
}
const rows = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(JSON.stringify({
  file: file.split("/").pop(), needle, dir, totalMs: +(totalUs / 1000).toFixed(1),
  targetSelfMs: +(targetSelf / 1000).toFixed(1), targetSelfPct: +((targetSelf / totalUs) * 100).toFixed(2),
  targetInclMs: +(targetIncl / 1000).toFixed(1), targetInclPct: +((targetIncl / totalUs) * 100).toFixed(2),
  rows: rows.map(([k, us]) => ({ fn: k, ms: +(us / 1000).toFixed(1), pct: +((us / totalUs) * 100).toFixed(2) })),
}, null, 1));

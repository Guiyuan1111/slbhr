/**
 * [hotspot 槽] .cpuprofile / .heapprofile 解析聚合器。
 *
 * 用法：node TEMP/hotspot/parse-profiles.mjs <file.cpuprofile|.heapprofile> [--top 25]
 * 输出：自包含 JSON 表（self/inclusive 时间或分配字节，按函数聚合 + 分类汇总）。
 *
 * 口径：
 * - cpuprofile：samples[i] 的叶节点记 self；inclusive 按样本栈逐函数去重（递归不重复计）；
 * - heapprofile：树上 selfSize（V8 采样分配的估算字节）按函数聚合。
 * - 分类：box2d(vendor) / kernel(shared/src/kernel) / server / colyseus / node内部 / GC / 其它。
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
const TOP = Number(process.argv[3] ?? 25);
if (!file) { console.error("usage: node parse-profiles.mjs <file> [topN]"); process.exit(1); }
const data = JSON.parse(readFileSync(file, "utf8"));

function classify(url, name) {
  if (name === "(garbage collector)") return "GC";
  if (name === "(program)" || name === "(idle)" || name === "(root)") return "v8/其它";
  const u = url ?? "";
  // vendor/box2d.js 经 new Function 求值（load.ts），cpuprofile 内无 URL；
  // Closure exportPath_ 使函数名为 "box2d.b2World.Step" 形态——按名归类
  if (u.includes("vendor/box2d.js") || u.includes("vendor-box2d") || (!u && name.startsWith("box2d."))) return "box2d引擎";
  if (u.includes("/kernel/")) return "内核胶水(shared/kernel)";
  if (u.includes("packages/shared")) return "shared其它";
  if (u.includes("packages/server")) return "server";
  if (u.includes("@colyseus") || u.includes("colyseus")) return "colyseus/schema";
  if (u.startsWith("node:") || u.includes("node:internal") || u.includes("internal/")) return "node内部";
  if (u.includes("tsx") || u.includes("node_modules")) return "node_modules其它";
  return "其它";
}

const out = { file, kind: file.endsWith(".heapprofile") ? "heap" : "cpu" };

if (out.kind === "cpu") {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of data.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const fkey = (n) => `${n.callFrame.functionName||"(匿名)"} @${(n.callFrame.url||"").split("/").slice(-2).join("/")}:${n.callFrame.lineNumber}`;

  const selfUs = new Map(), inclUs = new Map();
  let totalUs = 0;
  for (let i = 0; i < data.samples.length; i++) {
    const id = data.samples[i];
    const dt = data.timeDeltas[i] ?? 0;
    if (dt <= 0 && i > 0) continue;
    totalUs += dt;
    const node = nodes.get(id);
    if (!node) continue;
    const k = fkey(node);
    selfUs.set(k, (selfUs.get(k) ?? 0) + dt);
    // 栈去重 inclusive
    const seen = new Set();
    let cur = id;
    while (cur) {
      const nd = nodes.get(cur);
      if (!nd) break;
      const kk = fkey(nd);
      if (!seen.has(kk)) { seen.add(kk); inclUs.set(kk, (inclUs.get(kk) ?? 0) + dt); }
      cur = parent.get(cur);
    }
  }
  const catUs = new Map();
  const urlOf = new Map();
  for (const n of data.nodes) urlOf.set(fkey(n), { url: n.callFrame.url, name: n.callFrame.functionName });
  for (const [k, us] of selfUs) {
    const { url, name } = urlOf.get(k);
    const cat = classify(url, name);
    catUs.set(cat, (catUs.get(cat) ?? 0) + us);
  }
  const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  out.totalMs = +(totalUs / 1000).toFixed(1);
  out.selfTop = fmt(selfUs).slice(0, TOP).map(([k, us]) => ({ fn: k, selfMs: +(us / 1000).toFixed(1), selfPct: +((us / totalUs) * 100).toFixed(2) }));
  out.inclTop = fmt(inclUs).slice(0, TOP).map(([k, us]) => ({ fn: k, inclMs: +(us / 1000).toFixed(1), inclPct: +((us / totalUs) * 100).toFixed(2) }));
  out.selfByCategory = fmt(catUs).map(([k, us]) => ({ cat: k, selfMs: +(us / 1000).toFixed(1), selfPct: +((us / totalUs) * 100).toFixed(2) }));
  // box2d 家族细分（inclusive 口径，按方法名正则族）
  const fam = [
    ["contact-solver 速度约束", /SolveVelocityConstraints|WarmStart|InitializeVelocityConstraints|StoreImpulses/],
    ["contact-solver 位置约束/TOI", /SolvePositionConstraints|SolveTOIPositionConstraints|TimeOfImpact|SolveTOI/],
    ["broadphase 配对", /BroadPhase|UpdatePairs|Pair\b|b2DynamicTree/],
    ["contact 维护", /b2Contact\b|ContactManager|UpdateContacts|Evaluate/],
    ["body/fixture 同步", /SynchronizeFixtures|SynchronizeTransform|b2Body.Synchronize/],
    ["island/求解外壳", /b2Island|b2World.(Step|Solve|SolveTOI)/],
    ["js-绑定胶水", /b2\.js|load\.js|Box2D|GetPosition|GetLinearVelocity|wrap|pointer/],
  ];
  out.box2dFamilyIncl = fam.map(([label, re]) => {
    let us = 0;
    for (const [k, v] of inclUs) {
      const { url, name } = urlOf.get(k);
      const isBox = (url ?? "").includes("vendor/box2d.js") || (!(url ?? "") && (name ?? "").startsWith("box2d."));
      if (isBox && re.test(name)) us += v;
    }
    return { family: label, inclMs: +(us / 1000).toFixed(1), inclPct: +((us / totalUs) * 100).toFixed(2) };
  }).sort((a, b) => b.inclMs - a.inclMs);
} else {
  // heap profile
  const selfBytes = new Map(); const urlOf = new Map();
  let total = 0;
  (function walk(n) {
    const cf = n.callFrame;
    const k = `${cf.functionName || "(匿名)"} @${(cf.url || "").split("/").slice(-2).join("/")}:${cf.lineNumber}`;
    if (n.selfSize > 0) { selfBytes.set(k, (selfBytes.get(k) ?? 0) + n.selfSize); urlOf.set(k, { url: cf.url, name: cf.functionName }); total += n.selfSize; }
    for (const c of n.children ?? []) walk(c);
  })(data.head);
  const catB = new Map();
  for (const [k, b] of selfBytes) {
    const { url, name } = urlOf.get(k);
    const cat = classify(url, name);
    catB.set(cat, (catB.get(cat) ?? 0) + b);
  }
  const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  out.totalSampledKB = +(total / 1024).toFixed(1);
  out.allocTop = fmt(selfBytes).slice(0, TOP).map(([k, b]) => ({ fn: k, kb: +(b / 1024).toFixed(1), pct: +((b / total) * 100).toFixed(2) }));
  out.allocByCategory = fmt(catB).map(([k, b]) => ({ cat: k, kb: +(b / 1024).toFixed(1), pct: +((b / total) * 100).toFixed(2) }));
}
console.log(JSON.stringify(out, null, 1));

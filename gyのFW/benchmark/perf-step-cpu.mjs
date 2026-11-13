/**
 * 服务端每步 **CPU 自时间**归因（r48 新增）。
 *
 * 与 perf-server-alloc.mjs 的分工：
 *  - 那个量的是**分配**（HeapProfiler，selfSize）；
 *  - 这个量的是**耗时**（Profiler，按 samples+timeDeltas 聚合 self time）。
 *  r47 只证明了「自有代码在分配上占 9.8%」；CPU 上自有代码占多少、还剩多少可优化空间，
 *  此前只有 r44 的整进程粗分（physics 22.4% / 自有内核 3.5%），没有函数级口径。
 *
 * 为什么要先量这个：任何一轮优化的收益上限 = 目标函数的自时间占比。若自有内核在
 * 单步里只占 10%，那么把它优化一半也只能赢 5% 的单步——远小于若 vendor 占 70% 时的
 * 任何结构调整。**先算清上限，再决定值不值得动。**
 *
 * 口径要点：
 *  - 只覆盖步进窗口（warm 之后 start、跑完 stop），避免 tsx/module loader 淹没样本；
 *  - 采样间隔 100µs（单步 ~100µs，即每步约 1 个样本；1500 步 ≈ 1500 样本）；
 *  - 按 url 分类：vendor（box2d.js）/ kernel（packages/shared/src/kernel）/ server / 其它；
 *  - self time 归因到最内层帧，不做包含关系传播——这正是「谁在烧 CPU」的答案。
 *
 * 用法：
 *   node --import tsx benchmark/perf-step-cpu.mjs
 *   LEVELS=crystal_20 STEPS=3000 WARM=600 node --import tsx benchmark/perf-step-cpu.mjs
 *
 * 环境变量：LEVELS（逗号分隔）、STEPS（默认 1500）、WARM（默认 400）、
 *          INTERVAL（采样间隔 µs，默认 100）、TOP（打印条数，默认 18）。
 */
import { loadLevel } from "../packages/server/src/levels.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ids = (process.env.LEVELS ?? "crystal_20,light_23,crystal_03,fairies-20,forest_bonus_2")
  .split(",").map((s) => s.trim()).filter(Boolean);
const STEPS = Number(process.env.STEPS ?? 1500);
const WARM = Number(process.env.WARM ?? 400);
const INTERVAL = Number(process.env.INTERVAL ?? 100);
const TOP = Number(process.env.TOP ?? 18);
const scr = (t) => ({ left: t % 120 < 40, right: t % 120 >= 60, jump: t % 90 < 10 });

/**
 * 归属桶。**不能只看 url**：vendor/box2d.js 是 `new Function` 装载的（见 Box2DFlash 载入方式），
 * 其栈帧 url 恒为空——若按 url 分类，全部物理帧都会掉进 "native/other"，得出「vendor 不耗时」
 * 的荒谬结论。改以函数名前缀 `box2d.` 为主判据（vendor 的方法体都以 `box2d.` 开头导出）。
 */
function bucketOf(fn, url) {
  if (fn.startsWith("box2d.") || (url ?? "").includes("vendor/box2d")) return "vendor(box2d)";
  if (url.includes("shared/src/kernel")) return "kernel(own)";
  if (url.includes("packages/server/src")) return "server(own)";
  if (url.includes("node:inspector")) return "profiler-self";
  if (url.startsWith("node:")) return "node";
  if (fn === "(garbage collector)") return "gc";
  if (!url) return "native/other";
  return "other";
}

const inspector = await import("node:inspector");
const session = new inspector.Session();
session.connect();
const post = (m, p) => new Promise((res, rej) => session.post(m, p ?? {}, (e, r) => (e ? rej(e) : res(r))));

await post("Profiler.enable");
await post("Profiler.setSamplingInterval", { interval: INTERVAL });

for (const id of ids) {
  const L = loadLevel(id).level;
  const w = new World(L);
  for (let i = 0; i < WARM; i++) w.step(1 / 60, { fireboy: scr(i), watergirl: scr(i + 50) });

  await post("Profiler.start");
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < STEPS; i++) w.step(1 / 60, { fireboy: scr(i), watergirl: scr(i + 50) });
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const { profile } = await post("Profiler.stop");

  // nodeId → {fn,url,line}
  const meta = new Map();
  for (const n of profile.nodes) {
    const cf = n.callFrame;
    let url = cf.url || "";
    try { url = decodeURIComponent(url); } catch { /* 保持原样 */ }
    meta.set(n.id, { fn: cf.functionName || "(anon)", url, line: cf.lineNumber + 1 });
  }

  const self = new Map(); // key → µs
  let totalUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const m = meta.get(profile.samples[i]);
    const dt = profile.timeDeltas[i] ?? 0;
    if (dt <= 0) continue;
    totalUs += dt;
    const key = m ? `${m.fn} @ ${m.url.replace(/^.*?\/gyのFW\//, "").replace(/^file:\/\/\//, "")}:${m.line}` : "(unknown)";
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  // 再按桶汇总（按函数名 + url 分类；url 可能为空，见 bucketOf 注释）
  const byBucket = new Map();
  for (const [key, us] of self) {
    const [fn, rest] = key.split(" @ ");
    const url = (rest ?? "").replace(/:\d+$/, "");
    const b = bucketOf(fn, url);
    byBucket.set(b, (byBucket.get(b) ?? 0) + us);
  }

  // ⚠ 剖析器自开销必须独立成桶并**从分母剔除**：实测 profile 总时长可超过墙钟
  // （2000 步墙 134ms、采样累计 174ms），差额正是 node:inspector 的采样写回开销。
  // 若混在分母里，会凭空稀释每个真实占比（首版因此把 vendor 从 93% 压到 71%）。
  const profUs = byBucket.get("profiler-self") ?? 0;
  const denom = totalUs - profUs;

  const stepUs = (wallMs * 1000) / STEPS;
  console.log(`\n== ${id}  ${STEPS} 步  wall ${wallMs.toFixed(0)}ms = ${stepUs.toFixed(1)} µs/step  |  采样 ${profile.samples.length} 点 ==`);
  console.log(`   （分母已剔除剖析器自开销 ${(profUs / 1000).toFixed(1)}ms；采样净 ${(denom / 1000).toFixed(1)}ms vs 墙钟 ${wallMs.toFixed(0)}ms）`);
  console.log("   —— 归属桶（按 CPU 自时间）——");
  for (const [b, us] of [...byBucket.entries()].sort((a, b2) => b2[1] - a[1])) {
    if (b === "profiler-self") continue;
    console.log(`   ${((us / denom) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(1).padStart(7)}ms  ${b}`);
  }
  console.log("   —— top 函数（self time）——");
  const ranked = [...self.entries()]
    .filter(([k]) => !k.startsWith("post @ node:inspector"))
    .sort((a, b2) => b2[1] - a[1]);
  for (const [k, us] of ranked.slice(0, TOP)) {
    console.log(`   ${((us / denom) * 100).toFixed(1).padStart(5)}%  ${(us / STEPS).toFixed(2).padStart(7)} µs/step  ${k}`);
  }
}

session.disconnect();

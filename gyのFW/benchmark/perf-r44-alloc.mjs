/**
 * r44 · 分配量专测（不受 CPU 频率/热漂影响的硬指标）。
 *
 * 为什么单独一件：r44 各轮多为"免分配"型优化，其收益在 wall-clock 上常被机器噪声
 * 淹没（实测 241 关全库 scripted 均值臂间散布可达 ±5%，足以盖掉 percent 级改善）。
 * 分配字节数是确定性量：同一代码同一输入，每步净分配在 GC 前后堆差上逐字节稳定，
 * 与 CPU 频率无关。因此免分配类改动一律以本件判收益，wall-clock 只作旁证。
 *
 * 口径：
 * - 每个用例独立进程侧测量（同一进程内顺序跑，每例前 GC、后 GC）；
 * - net = (GC后堆 − GC前堆) / 步数 —— 扣掉循环内产生的所有临时对象；
 * - 同时记 gc 事件计数（perf_hooks GC 观察器），衡量 GC 压力；
 * - 对照组 = 同一 World 在 --compare 快照下的历史值。
 *
 * 用法：
 *   node --expose-gc --import tsx benchmark/perf-r44-alloc.mjs --save r44-alloc-a
 *   node --expose-gc --import tsx benchmark/perf-r44-alloc.mjs --compare r44-alloc-a
 * 产物：benchmark/results/r44alloc-<label>.json
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { PerformanceObserver } from "node:perf_hooks";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.PERF_ALLOC_STEPS ?? 5000);
const WARMUP = 400;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

if (typeof global.gc !== "function") {
  console.error("需要 --expose-gc：node --expose-gc --import tsx benchmark/perf-r44-alloc.mjs ...");
  process.exit(2);
}

/** 代表用例：每类机制各取一关（覆盖 forest/light/ice/crystal/elements/fairytales） */
function pickCases() {
  const ids = listLevelIds();
  const has = (id) => ids.includes(id);
  const pick = (...cands) => cands.find(has);
  const cases = [];
  const add = (label, id) => {
    if (id) cases.push({ label, id });
  };
  add("forest 轻关", pick("forest_01"));
  add("forest 重关", pick("forest_bonus_2", "forest_bonus_1"));
  add("light 光束", pick("light_27", "light_22"));
  add("ice 定时闸", pick("ice_02", "ice_03"));
  add("ice TOI 极端", pick("ice_17"));
  add("crystal 传送门", pick("crystal_04", "crystal_05"));
  add("elements 元素", pick("efire_2", "ewater_1"));
  // 仙女关：取有几只仙女的
  const fairy = ids.filter((i) => i.startsWith("fairies")).sort();
  add("fairytales 仙女", fairy[0]);
  add("fairytales 仙女(多)", fairy.find((i) => i.includes("-05")) ?? fairy[fairy.length - 1]);
  return cases;
}

const IDLE = { up: false, left: false, right: false };
const INP = { fireboy: { ...IDLE }, watergirl: { ...IDLE } };
/** scripted：周期走跳（真实驱动角色/接触/机关，比 idle 更接近游玩负载） */
function drive(f) {
  const ph = f % 96;
  INP.fireboy.up = ph % 24 === 0;
  INP.fireboy.right = ph < 40;
  INP.fireboy.left = ph >= 48 && ph < 78;
  INP.watergirl.up = ph % 24 === 12;
  INP.watergirl.right = ph >= 20 && ph < 60;
  INP.watergirl.left = ph >= 68 && ph < 92;
  return INP;
}

const gcEvents = [];
const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) gcEvents.push(e);
});
obs.observe({ entryTypes: ["gc"] });

const rows = [];
for (const { label, id } of pickCases()) {
  const w = new World(loadLevel(id).level);
  for (let i = 0; i < WARMUP; i++) w.step(1 / 60, drive(i));

  gcEvents.length = 0;
  global.gc();
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < STEPS; i++) w.step(1 / 60, drive(i + WARMUP));
  global.gc();
  const h1 = process.memoryUsage().heapUsed;

  const gcCount = gcEvents.length;
  const gcMs = gcEvents.reduce((s, e) => s + e.duration, 0);
  rows.push({
    label,
    id,
    netBPerStep: +((h1 - h0) / STEPS).toFixed(2),
    gcPer1kSteps: +((gcCount / STEPS) * 1000).toFixed(2),
    gcMsPer1kSteps: +((gcMs / STEPS) * 1000).toFixed(3),
  });
  console.log(
    `${label.padEnd(18)} ${id.padEnd(20)} net=${String(rows.at(-1).netBPerStep).padStart(9)}B/步  GC=${String(rows.at(-1).gcPer1kSteps).padStart(6)}/1k步  ${String(rows.at(-1).gcMsPer1kSteps).padStart(7)}ms/1k步`,
  );
}

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    steps: STEPS,
    node: process.version,
  },
  rows,
};

if (argSave) {
  writeFileSync(join(RESULTS, `r44alloc-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`\n已存档 r44alloc-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `r44alloc-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 分配对比：${argCompare}（${base.meta.git}）=====`);
  let totalBefore = 0;
  let totalAfter = 0;
  for (const cur of rows) {
    const ref = base.rows.find((r) => r.id === cur.id);
    if (!ref) {
      console.log(`${cur.label}: 快照缺失`);
      continue;
    }
    totalBefore += Math.max(0, ref.netBPerStep);
    totalAfter += Math.max(0, cur.netBPerStep);
    const d = ref.netBPerStep === 0 ? 0 : ((cur.netBPerStep - ref.netBPerStep) / ref.netBPerStep) * 100;
    const mark = cur.netBPerStep < ref.netBPerStep ? "↓" : cur.netBPerStep > ref.netBPerStep ? "↑" : "=";
    console.log(
      `${cur.label.padEnd(18)} ${ref.netBPerStep.toFixed(1).padStart(9)} → ${cur.netBPerStep.toFixed(1).padStart(9)} B/步  ${mark}${Math.abs(d).toFixed(1)}%` +
        `   GC ${ref.gcPer1kSteps.toFixed(2)} → ${cur.gcPer1kSteps.toFixed(2)}/1k步`,
    );
  }
  const dAll = totalBefore === 0 ? 0 : ((totalAfter - totalBefore) / totalBefore) * 100;
  console.log(`\n合计净分配（正部分求和）：${totalBefore.toFixed(0)} → ${totalAfter.toFixed(0)} B/步（${dAll >= 0 ? "+" : ""}${dAll.toFixed(1)}%）`);
}

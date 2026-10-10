/**
 * 全关卡路线门禁扫荡：顺序跑每关 route.mjs（repeat≥3），汇总成败表。
 *
 * 用法（Git Bash，先注入便携 Node PATH）：
 *   node scripts/e2e/route-all.mjs [--levels forest_02,forest_03,...] [--batch1] [--port-base 3620] [--repeat 3]
 *
 * 设计：子进程隔离跑 route.mjs（每关独立服务端/浏览器，退码聚合）；顺序执行——
 * 门禁是双浏览器重负载，并行会互相挤压调度抖动（产线期单关并发由派工单端口隔离保证）。
 * 输出：逐关 PASS/FAIL 行 + 汇总（ALL GREEN / N 关未过），任何 FAIL 退码 1。
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ROOT, argOf, log } from "./lib.mjs";

const args = process.argv.slice(2);
const REPEAT = Number(argOf(args, "repeat", "3"));
const PORT_BASE = Number(argOf(args, "port-base", "3620"));
const OUT = join(ROOT, "scripts", "e2e", "out");

/** 批次表（level-batches.md §5，产出后逐批补齐；--batch1 等开关按批选择） */
const BATCHES = {
  batch1: ["forest_06", "forest_06_1", "forest_09", "forest_09_1", "forest_03", "forest_03_1", "forest_12", "forest_12_1", "forest_26"],
  batch2: ["forest_21", "forest_14", "forest_14_1", "forest_16", "forest_10", "forest_28", "forest_11", "forest_32", "forest_32_1", "forest_23"],
  batch3: ["forest_05", "forest_22", "forest_04", "forest_02", "forest_08", "forest_24", "forest_24_1", "forest_31", "forest_27", "forest_27_1"],
  batch4: ["forest_25", "forest_25_1", "forest_bonus_3", "forest_17", "forest_04_1", "forest_17_1", "forest_19", "forest_19_1", "forest_13", "forest_13_1"],
  batch5: ["forest_29", "forest_18", "forest_bonus_1", "forest_30", "forest_15", "forest_20", "forest_07", "forest_bonus_2"],
  tutorial: ["forest_01"],
};

let levels = [];
if (args.includes("--all")) levels = Object.values(BATCHES).flat();
else for (const [k, list] of Object.entries(BATCHES)) if (args.includes(`--${k}`)) levels.push(...list);
if (argOf(args, "levels", "")) levels.push(...argOf(args, "levels", "").split(",").map((s) => s.trim()).filter(Boolean));
if (!levels.length) {
  console.error("用法: --levels a,b,c 或 --batchN/--tutorial/--all");
  process.exit(2);
}

const results = [];
for (let i = 0; i < levels.length; i++) {
  const level = levels[i];
  const port = PORT_BASE + (i % 8);
  log(`[${i + 1}/${levels.length}] ${level} (port ${port})`);
  const r = spawnSync(process.execPath, ["scripts/e2e/route.mjs", "--level", level, "--repeat", String(REPEAT), "--port", String(port)], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: (REPEAT * 240 + 120) * 1000,
  });
  const tail = (r.stdout ?? "").split("\n").filter((l) => l.includes("[route-run") || l.includes("ALL PASS") || l.includes("FAILED"));
  for (const l of tail) log("  " + l.trim());
  const ok = r.status === 0;
  results.push({ level, ok, exitCode: r.status, lines: tail });
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "route-all-results.json"), JSON.stringify({ repeat: REPEAT, results }, null, 1));
log(`==== 扫荡汇总：${results.length - failed.length}/${results.length} 过 ====${failed.length ? " 未过: " + failed.map((r) => r.level).join(", ") : " ALL GREEN"}`);
process.exit(failed.length ? 1 : 0);

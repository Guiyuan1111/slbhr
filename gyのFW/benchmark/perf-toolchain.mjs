/**
 * 开发工具链基准（r10）：test/build/typecheck/sync-assets 四命令时长。
 *
 * 面：开发者每轮迭代的等待时间（r6c 已收 det 门禁 -44%/typecheck -38%，
 * 本轮补 vitest 与 vite build（含 sync-assets 全量拷贝）两面）。
 * 口径：`time npm run …` 三次取中位；build 拆 sync-assets（npm run sync-assets
 * 单独计）与纯 vite 段（差值）；typecheck 为增量口径（r6c 起）。
 * 用法：
 *   node benchmark/perf-toolchain.mjs --save <label>
 *   node benchmark/perf-toolchain.mjs --compare <label>
 * 产物：benchmark/results/toolchain-<label>.json
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const RUNS = Number(process.argv.includes("--runs") ? process.argv[process.argv.indexOf("--runs") + 1] : 3);
const log = (...a) => console.log("[toolchain]", ...a);

function timeCmd(cmd, label) {
  const xs = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    // || true：计时口径不因命令退出码中断（正确性门禁另行单独跑；typecheck 增量
    // 口径受并行在飞文件影响时两侧同担，见 r10 报告）
    execSync(cmd + " || true", { cwd: ROOT, stdio: "ignore", shell: "/bin/bash" });
    xs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  xs.sort((a, b) => a - b);
  const med = +xs[Math.floor(xs.length / 2)].toFixed(0);
  log(`${label.padEnd(14)} 中位=${med}ms（${RUNS} 轮: ${xs.map((x) => x.toFixed(0)).join("/")}）`);
  return med;
}

const out = {};
out.npmTest = timeCmd("npm test", "npm test");
out.syncAssets = timeCmd("npm run sync-assets", "sync-assets");
out.buildFull = timeCmd("npm run build", "build(全)"); // 内含 sync-assets
out.buildVite = out.buildFull - out.syncAssets; // 纯 vite 段（差值口径）
out.typecheck = timeCmd("npm run typecheck", "typecheck"); // 增量

log(`拆解: build(全)=${out.buildFull} = sync ${out.syncAssets} + vite ${out.buildVite}`);

if (argSave) {
  writeFileSync(
    join(ROOT, "benchmark", "results", `toolchain-${argSave}.json`),
    JSON.stringify({ meta: { git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(), runs: RUNS }, results: out }, null, 2),
  );
  log(`快照：results/toolchain-${argSave}.json`);
}
if (argCompare) {
  const p = join(ROOT, "benchmark", "results", `toolchain-${argCompare}.json`);
  if (!existsSync(p)) { log(`对比快照不存在: ${p}`); process.exit(1); }
  const prev = JSON.parse(readFileSync(p, "utf8")).results;
  console.log("\n[toolchain] 前后对比（中位 ms）");
  for (const k of Object.keys(out)) {
    const a = prev[k] ?? null;
    const d = a ? `${(((out[k] - a) / a) * 100).toFixed(1)}%` : "—";
    console.log(`  ${k.padEnd(14)} ${String(a ?? "—").padStart(6)} → ${String(out[k]).padStart(6)}  ${d}`);
  }
}

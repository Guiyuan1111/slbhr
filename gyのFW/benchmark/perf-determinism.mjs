/**
 * 确定性门禁：全 48 关 × 固定输入脚本逐步推进，对每步全部刚体运动态做
 * 逐位（float64 原始位）哈希链。用于验证任何引擎层优化前后【位级一致】。
 *
 * - 每步哈希输入：按 GetBodyList 创建序遍历全部刚体，取
 *   x, y, angle, vx, vy, omega 共 6×f64 的原始字节；
 * - 链式哈希：step i 的哈希包含 step i−1 的哈希（即使状态后来巧合重合，分叉也会被发现）；
 * - 输入脚本：纯 step 序号的确定性函数（无 RNG），两种模式均跑：
 *   idle（全空输入）+ scripted（周期走/跳，驱动角色力/TOI/机关路径）。
 * - 并行（r6 工具链轮）：关间 worker_threads 池并行（缺省 cap 4 线程，一关一发动态负载
 *   均衡+逆序派发。cap 4 为本机 4C/8T 实测碗底：W=2/3/4/5/6/7 → 2.5/2.1/2.1/2.3/2.5/2.8s，
 *   每 worker 需独立 tsx+esbuild 启动，过订阅得不偿失；DET_WORKERS 可覆盖）。判据零变化：
 *   每关哈希只依赖 关卡数据×输入脚本×步数，World 间无共享态
 *   （每线程独立 ESM 模块注册表 → b2.ts/load.ts 的 cached box2d 单例每线程一份独立实例），
 *   哈希值、行序（按 id sort）、综合链 sha、JSON rows、--save/--compare/--exit 码语义逐字
 *   不变；meta 仅新增 workers 字段（--compare 不读取，快照对比不受影响）。DET_WORKERS=0/1
 *   回到单进程内联=旧串行路径；非有限值显式报错（防零行静默绿门禁）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-determinism.mjs --save <label>
 *   node --import tsx benchmark/perf-determinism.mjs --compare <label>
 *   DET_WORKERS=0 node --import tsx benchmark/perf-determinism.mjs   # 单进程内联（旧串行）
 * 产物：benchmark/results/det-<label>.json
 */
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

// TS 模块加载：worker 线程内 tsx 不会自动注册解析钩子——tsx dist/esm/index.mjs 的自动注册
// 条件为 isFeatureSupported([[22,22,3],[24,11,1],...])&&!isInternalThread
//   || isFeatureSupported([[18,19,0],[20,6,0]])&&isMainThread，本机 Node 22.22.1 落在
// 第一个特性门之外，worker 内两支皆 false（与 execArgv 继承与否无关，已探针实证：
// ERR_MODULE_NOT_FOUND levels.js）。修法：worker 分支先 tsx/esm/api 的 register()
// （该显式 API 无 isMainThread 门，探针实证可用）再动态 import；主线程沿用 --import tsx。
let loadLevel, listLevelIds, World;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.DET_STEPS ?? 600);
/** worker 线程数；0/1=单进程内联（旧串行路径）。缺省 cap 4（4C/8T 实测碗底，见头注）。
 *  非有限/负值直接抛错——NaN 若流入并行分支会得到零 worker 零行，
 *  --compare 下即"0 关位级一致"静默绿门禁，属门禁红线，必须在此拦死。 */
function resolveWorkers() {
  const raw = process.env.DET_WORKERS;
  if (raw === undefined) return Math.min(4, Math.max(1, availableParallelism() - 1));
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`DET_WORKERS 非法: "${raw}"（需非负数；0/1=单进程串行）`);
  return n;
}
const WORKERS = resolveWorkers();

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

/** 确定性输入脚本（idle / scripted 两模式） */
function scriptInputs(mode, step) {
  if (mode === "idle") {
    return { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } };
  }
  // scripted：周期 37 步轮换的行为模式（相位由 step 决定，跨运行恒定）
  const phase = step % 37;
  const fb = { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 };
  const wg = { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 };
  return { fireboy: fb, watergirl: wg };
}

const buf = new Float64Array(6);
const bufView = Buffer.from(buf.buffer, 0, 48);

/** 收集一个 World 的逐步链式哈希 */
function chainHash(world, mode) {
  const b2world = world.built.world;
  const hash = createHash("sha256");
  for (let step = 0; step < STEPS; step++) {
    world.step(1 / 60, scriptInputs(mode, step));
    let off = 0;
    for (let b = b2world.GetBodyList(); b; b = b.GetNext()) {
      const p = b.GetPosition();
      const v = b.GetLinearVelocity();
      buf[0] = p.x; buf[1] = p.y; buf[2] = b.GetAngle();
      buf[3] = v.x; buf[4] = v.y; buf[5] = b.GetAngularVelocity();
      hash.update(bufView);
      off++;
    }
    hash.update(Buffer.of(off & 0xff, (off >> 8) & 0xff)); // 体数也进哈希（销毁体=状态变化）
  }
  return hash.digest("hex");
}

/** 单关全链：两个独立 World（idle/scripted）各跑满步数取链式哈希。纯函数：
 *  只依赖关卡数据×输入脚本×步数，线程/进程间零共享态。 */
function runLevel(id) {
  const t0 = Date.now();
  const w1 = new World(loadLevel(id).level);
  const idle = chainHash(w1, "idle");
  const w2 = new World(loadLevel(id).level);
  const scripted = chainHash(w2, "scripted");
  return { id, steps: STEPS, idle, scripted, ms: Date.now() - t0 };
}

if (!isMainThread) {
  // worker 模式：先补注册 tsx 钩子（见上方注释），再动态加载 TS 链路。
  const { register } = await import("tsx/esm/api");
  register();
  ({ loadLevel, listLevelIds } = await import("../packages/server/src/levels.js"));
  ({ World } = await import("@fw/shared/kernel"));
  // 主线程逐关派发 id（一关一发=动态负载均衡，最重关不静态压死单线程），
  // 回传 {id,steps,idle,scripted,ms}。workerData 占位（id 全部走 message 通道）。
  void workerData;
  parentPort.on("message", (id) => {
    if (id == null) { parentPort.close(); return; }
    parentPort.postMessage(runLevel(id));
  });
} else {
  ({ loadLevel, listLevelIds } = await import("../packages/server/src/levels.js"));
  ({ World } = await import("@fw/shared/kernel"));
  await main();
}

async function main() {
  const ids = listLevelIds().sort();
  console.log(`确定性门禁：${ids.length} 关 × ${STEPS} 步 × (idle + scripted)` + (WORKERS > 1 ? `（worker 池 ×${WORKERS}）` : ""));
  const rows = [];
  // ms 只进日志不进 rows（payload JSON 与旧串行版字节等价）
  const pushRow = ({ ms, ...rest }) => {
    rows.push(rest);
    console.log(`${rest.id.padEnd(22)} idle=${rest.idle.slice(0, 12)} scripted=${rest.scripted.slice(0, 12)} (${(ms / 1000).toFixed(1)}s)`);
  };

  const t0 = Date.now();
  if (WORKERS <= 1) {
    for (const id of ids) pushRow(runLevel(id));
  } else {
    // 派发序=sort 序的逆序（重关 forest_bonus_* 在 sort 序末尾，先上车消除单关尾延迟；
    // 严重度来自 r0 快照实测：bonus_2 ≈0.9s vs 其余关 ≈0.05s）。行序最终仍按 id sort
    // 归一（下方 rows.sort），判据不受派发序影响。
    const queue = [...ids].reverse();
    let next = 0;
    const run = () => new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url));
      w.on("message", (row) => {
        pushRow(row);
        w.postMessage(next < queue.length ? queue[next++] : null); // 取完即发 null 收工（线程 clean close）
      });
      w.on("error", reject);
      w.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`det worker 异常退出 code=${code}`))));
      w.postMessage(queue[next++]);
    });
    await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, run));
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // 行序=旧串行版（ids sort 序）
  console.log(`（本次 ${ids.length} 关合计 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);

  const combined = createHash("sha256").update(rows.map((r) => `${r.id}:${r.idle}:${r.scripted}`).join("\n")).digest("hex");
  const payload = {
    meta: {
      label: argSave ?? argCompare ?? "(run)",
      git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
      date: new Date().toISOString(),
      steps: STEPS,
      node: process.version,
      workers: WORKERS > 1 ? WORKERS : 1,
    },
    combined,
    rows,
  };

  if (argSave) {
    writeFileSync(join(RESULTS, `det-${argSave}.json`), JSON.stringify(payload, null, 2));
    console.log(`\n已存档 det-${argSave}.json，综合链哈希 ${combined.slice(0, 16)}…`);
  }
  if (argCompare) {
    const fp = join(RESULTS, `det-${argCompare}.json`);
    if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
    const base = JSON.parse(readFileSync(fp, "utf8"));
    if (base.meta.steps !== STEPS) throw new Error(`步数口径不一致（快照 ${base.meta.steps} vs 本次 ${STEPS}），换 DET_STEPS 重跑`);
    let diff = 0;
    for (const cur of rows) {
      const ref = base.rows.find((r) => r.id === cur.id);
      if (!ref) { console.log(`${cur.id}: 快照缺失`); diff++; continue; }
      if (ref.idle !== cur.idle || ref.scripted !== cur.scripted) {
        diff++;
        console.log(`${cur.id}: ✗ 不一致 idle=${ref.idle === cur.idle ? "同" : "异"} scripted=${ref.scripted === cur.scripted ? "同" : "异"}`);
      }
    }
    const baseIds = new Set(base.rows.map((r) => r.id));
    for (const id of ids) if (!baseIds.has(id)) { console.log(`${id}: 快照无此关`); diff++; }
    console.log(diff === 0 ? `\n✓ 全部 ${rows.length} 关位级一致（对比 ${argCompare}）` : `\n✗ ${diff} 关出现位级漂移`);
    process.exitCode = diff === 0 ? 0 : 1;
  }
}

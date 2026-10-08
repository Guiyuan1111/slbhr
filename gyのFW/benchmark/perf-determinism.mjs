/**
 * 确定性门禁：全 48 关 × 固定输入脚本逐步推进，对每步全部刚体运动态做
 * 逐位（float64 原始位）哈希链。用于验证任何引擎层优化前后【位级一致】。
 *
 * - 每步哈希输入：按 GetBodyList 创建序遍历全部刚体，取
 *   x, y, angle, vx, vy, omega 共 6×f64 的原始字节；
 * - 链式哈希：step i 的哈希包含 step i−1 的哈希（即使状态后来巧合重合，分叉也会被发现）；
 * - 输入脚本：纯 step 序号的确定性函数（无 RNG），两种模式均跑：
 *   idle（全空输入）+ scripted（周期走/跳，驱动角色力/TOI/机关路径）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-determinism.mjs --save <label>
 *   node --import tsx benchmark/perf-determinism.mjs --compare <label>
 * 产物：benchmark/results/det-<label>.json
 */
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.DET_STEPS ?? 600);

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

const ids = listLevelIds().sort();
console.log(`确定性门禁：${ids.length} 关 × ${STEPS} 步 × (idle + scripted)`);
const rows = [];
for (const id of ids) {
  const t0 = Date.now();
  const w1 = new World(loadLevel(id).level);
  const idle = chainHash(w1, "idle");
  const w2 = new World(loadLevel(id).level);
  const scripted = chainHash(w2, "scripted");
  rows.push({ id, steps: STEPS, idle, scripted });
  console.log(`${id.padEnd(22)} idle=${idle.slice(0, 12)} scripted=${scripted.slice(0, 12)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

const combined = createHash("sha256").update(rows.map((r) => `${r.id}:${r.idle}:${r.scripted}`).join("\n")).digest("hex");
const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    steps: STEPS,
    node: process.version,
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

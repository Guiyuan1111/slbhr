/**
 * 负载口径探针：同一 World 下 idle（EMPTY_INPUT，角色落睡空转）vs scripted（确定性走跳，
 * perf-determinism 同款发生器）的单步成本对比。
 *
 * 由 bench 槽 r0 基线（note/report/perf/2026-10-18-r0-baseline.md §二）落档：
 * perf-step.mjs 是空载口径，活跃房间（scripted）成本低估 2~6 倍——本探针即该结论的可复现依据，
 * 后续优化轮如给 perf-step 加 scripted 档，先以本脚本对拍。
 *
 * 用法：node --import tsx benchmark/probe-step-load.mjs
 */
import { performance } from "node:perf_hooks";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";

const LEVELS = process.env.PERF_LEVELS ? process.env.PERF_LEVELS.split(",").map((s) => s.trim()) : ["forest_01", "forest_bonus_2"];
const STEPS = 600;
const WARMUP = 120;

function scriptInputs(step) {
  const phase = step % 37;
  const fb = { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 };
  const wg = { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 };
  return { fireboy: fb, watergirl: wg };
}

for (const id of LEVELS) {
  const row = [];
  for (const mode of ["idle", "scripted"]) {
    const w = new World(loadLevel(id).level);
    const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };
    for (let i = 0; i < WARMUP; i++) w.step(1 / 60, mode === "idle" ? inputs : scriptInputs(i));
    const ms = [];
    for (let i = 0; i < STEPS; i++) {
      const t = performance.now();
      w.step(1 / 60, mode === "idle" ? inputs : scriptInputs(i));
      ms.push(performance.now() - t);
    }
    const avg = ms.reduce((a, b) => a + b) / ms.length;
    row.push(`${mode}=${avg.toFixed(4)}ms`);
  }
  console.log(`${id.padEnd(22)} ${row.join("  ")}`);
}

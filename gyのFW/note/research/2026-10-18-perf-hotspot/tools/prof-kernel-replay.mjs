/**
 * [hotspot 槽] 内核整关回放剖析驱动（产品代码零改动）。
 * routes/forest_01.json 事件流 → 逐帧输入表 → World.step 回放整关（WIN@f2365 为预期），
 * reset() 后循环 REPLAYS 遍凑采样量。
 *
 * 用法：
 *   node --import tsx TEMP/hotspot/prof-kernel-replay.mjs
 *   HS_REPLAYS=40 HS_LEVEL=forest_01 node --import tsx ...
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { loadLevel } from "../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEVEL = process.env.HS_LEVEL ?? "forest_01";
const REPLAYS = Number(process.env.HS_REPLAYS ?? 40);

const doc = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
const FRAMES = doc.totalFrames;

/** 事件流 → 逐帧输入表（down 起持续到流末或 up；与 route.mjs「按帧下键」语义一致） */
function buildTrack(events) {
  const track = Array.from({ length: FRAMES + 1 }, () => ({ up: false, left: false, right: false }));
  const last = { up: -1, left: -1, right: -1 };
  const down = { up: false, left: false, right: false };
  for (const ev of [...events].sort((a, b) => a.f - b.f)) {
    down[ev.dir] = ev.type === "down";
    for (let f = Math.max(0, ev.f); f <= FRAMES; f++) track[f][ev.dir] = down[ev.dir];
  }
  return track;
}
const fbTrack = buildTrack(doc.fb);
const wgTrack = buildTrack(doc.wg);

const w = new World(loadLevel(LEVEL).level);
let winFrames = [];
let totalSteps = 0;
const t0 = performance.now();
for (let r = 0; r < REPLAYS; r++) {
  if (r > 0) w.reset();
  for (let f = 0; f < FRAMES; f++) {
    w.step(1 / 60, { fireboy: fbTrack[f], watergirl: wgTrack[f] });
    totalSteps++;
    if (w.phase !== "playing") { winFrames.push(f); break; }
  }
}
const dtMs = performance.now() - t0;

console.log(JSON.stringify({
  driver: "kernel-replay", level: LEVEL, replays: REPLAYS, totalFrames: FRAMES,
  /** 每遍回放终止帧（phase 离开 playing 处；WIN 时应≈路由注记 f2365） */
  endFrames: winFrames,
  totalSteps, totalMs: +dtMs.toFixed(1),
  msPerReplay: +(dtMs / REPLAYS).toFixed(2),
  usPerStep: +((dtMs * 1000) / totalSteps).toFixed(2),
  replaysPerSec: +((REPLAYS / (dtMs / 1000))).toFixed(1),
}));

/**
 * r4 encode 段 CPU 剖析：node:inspector Profiler 包住 perf-serialize 同构 60Hz 循环，
 * 产出 .cpuprofile；分析按 self time 聚合（schema 模块函数单列）。
 * 用法：node --import tsx TEMP/perfopt4/prof-encode.mjs [levelId]
 */
import { Session } from "node:inspector";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { loadLevel } from "../../../../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../../../../../packages/server/src/rooms/state.js";

const require = createRequire(import.meta.url);
const { Encoder } = require("@colyseus/schema");

const levelId = process.argv[2] ?? "forest_bonus_2";
const TICKS = 3600; // 60 仿真秒
const WARMUP = 300;

function scriptInputs(step) {
  const phase = step % 37;
  const fb = { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 };
  const wg = { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 };
  return { fireboy: fb, watergirl: wg };
}

// ---- 与 perf-serialize.mjs 同构 buildState/syncState（缩微引用，见其源） ----
function buildState(world) {
  const state = new RoomState();
  for (const role of ["fireboy", "watergirl"]) state.players.set(role, new PlayerState());
  for (const d of world.diamonds) state.diamonds.set(d.id, new DiamondState());
  const snap = world.mechSnapshot();
  for (const l of snap.levers) state.levers.set(String(l.id), new LeverState());
  for (const p of snap.pushers) state.pushers.set(String(p.id), new PusherState());
  for (const p of snap.platforms) state.platforms.set(String(p.id), new BodyState());
  for (const p of snap.props) state.props.set(`${p.kind}:${p.id}`, new BodyState());
  for (const wd of snap.winds) state.winds.set(String(wd.id), new WindState());
  for (const h of snap.hangings) state.hangings.set(String(h.id), new BodyState());
  for (const p of snap.pulleys) {
    state.pulleys.set(`u${p.id}a`, new BodyState());
    state.pulleys.set(`u${p.id}b`, new BodyState());
  }
  for (const r of snap.romans) state.romans.set(String(r.id), new BodyState());
  return state;
}
function syncState(world, state) {
  const snap = world.mechSnapshot();
  for (const role of ["fireboy", "watergirl"]) {
    const sim = world.snapshotPlayer(role);
    const ps = state.players.get(role);
    ps.x = Math.round(sim.x * 10) / 10;
    ps.y = Math.round(sim.y * 10) / 10;
    ps.vx = Math.round(sim.vx * 10) / 10;
    ps.vy = Math.round(sim.vy * 10) / 10;
    ps.facing = sim.facing;
    ps.anim = sim.anim;
    ps.headTilt = Math.round(sim.headTilt * 1000) / 1000;
    ps.inLiquid = sim.inLiquid;
    ps.dying = sim.dying;
    ps.dead = sim.dead;
    ps.isDead = sim.isDead;
    ps.atDoor = sim.atDoor;
    ps.doorFrame = sim.doorFrame;
    ps.doorUp = sim.doorUp;
  }
  for (const d of world.diamonds) state.diamonds.get(d.id).collected = d.collected;
  for (const l of snap.levers) {
    const ls = state.levers.get(String(l.id));
    ls.group = l.group; ls.state = l.state; ls.angle = Math.round(l.angle * 1000) / 1000;
  }
  for (const p of snap.pushers) {
    const ps2 = state.pushers.get(String(p.id));
    ps2.group = p.group; ps2.state = p.state;
    ps2.x = Math.round(p.x * 10) / 10; ps2.y = Math.round(p.y * 10) / 10;
  }
  for (const p of snap.platforms) {
    const bs = state.platforms.get(String(p.id));
    bs.x = Math.round(p.x * 10) / 10; bs.y = Math.round(p.y * 10) / 10; bs.angle = Math.round(p.angle * 1000) / 1000;
    bs.state = p.state;
  }
  for (const p of snap.props) {
    const bs = state.props.get(`${p.kind}:${p.id}`);
    bs.x = Math.round(p.x * 10) / 10; bs.y = Math.round(p.y * 10) / 10; bs.angle = Math.round(p.angle * 1000) / 1000;
  }
  for (const wd of snap.winds) {
    const ws = state.winds.get(String(wd.id));
    ws.group = wd.group; ws.state = wd.state;
  }
  for (const h of snap.hangings) {
    const bs = state.hangings.get(String(h.id));
    bs.x = Math.round(h.x * 10) / 10; bs.y = Math.round(h.y * 10) / 10; bs.angle = Math.round(h.angle * 1000) / 1000;
  }
  for (const p of snap.pulleys) {
    for (const [suffix, pose] of [["a", p.a], ["b", p.b]]) {
      const bs = state.pulleys.get(`u${p.id}${suffix}`);
      bs.x = Math.round(pose.x * 10) / 10; bs.y = Math.round(pose.y * 10) / 10; bs.angle = Math.round(pose.angle * 1000) / 1000;
    }
  }
  for (const r of snap.romans) {
    const bs = state.romans.get(String(r.id));
    bs.x = Math.round(r.x * 10) / 10; bs.y = Math.round(r.y * 10) / 10; bs.angle = Math.round(r.angle * 1000) / 1000;
  }
  const doors = world.doors;
  state.doors.fbAtDoor = doors.fireboy.isOpen;
  state.doors.wgAtDoor = doors.watergirl.isOpen;
  state.doors.fbFrame = doors.fireboy.frac;
  state.doors.wgFrame = doors.watergirl.frac;
  state.doors.fbUp = doors.fireboy.isUp;
  state.doors.wgUp = doors.watergirl.isUp;
  state.timerMs = Math.round(world.timerMs);
}

const world = new World(loadLevel(levelId).level);
const state = buildState(world);
const encoder = new Encoder(state);

// 预热
for (let i = 0; i < WARMUP; i++) {
  world.step(1 / 60, scriptInputs(i));
  syncState(world, state);
  encoder.sharedBuffer[0] = 0;
  const bytes = encoder.encode({ offset: 1 });
  encoder.discardChanges();
  if (bytes.length === 0) throw new Error("空 patch？");
}

const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 20 }); // 20µs 采样
await session.post("Profiler.start");

let patchBytes = 0;
for (let i = 0; i < TICKS; i++) {
  world.step(1 / 60, scriptInputs(i + WARMUP));
  syncState(world, state);
  encoder.sharedBuffer[0] = 0;
  const bytes = encoder.encode({ offset: 1 });
  encoder.discardChanges();
  patchBytes += bytes.length;
}

const profile = await new Promise((resolve, reject) => {
  session.post("Profiler.stop", (err, { profile: p }) => (err ? reject(err) : resolve(p)));
});
writeFileSync(join(import.meta.dirname, `prof-${levelId}.cpuprofile`), JSON.stringify(profile));
console.log(`${levelId}: ${TICKS} ticks 编码完成，patch 均值 ${(patchBytes / TICKS).toFixed(0)}B，profile 已落盘`);

// ---- 自解析：按 URL 分桶 + schema 模块函数 self time Top ----
const byFn = new Map();
const byUrl = new Map();
for (const node of profile.nodes) {
  const cf = node.callFrame;
  const key = `${cf.functionName || "(anonymous)"}@${(cf.url || "").replace(/^.*node_modules\//, "")}:${cf.lineNumber + 1}`;
  byFn.set(key, (byFn.get(key) ?? 0) + (node.hitCount ?? 0));
  const urlKey = (cf.url || "(vm)").replace(/^.*node_modules\//, "node_modules/").replace(/^file:.*\/packages\//, "packages/");
  byUrl.set(urlKey, (byUrl.get(urlKey) ?? 0) + (node.hitCount ?? 0));
}
const total = [...byFn.values()].reduce((a, b) => a + b, 0);
console.log(`\nsamples 总数 ${total}；按文件分桶（self hits）：`);
for (const [k, v] of [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`);
}
console.log(`\n@colyseus/schema 函数 self Top20：`);
const schemaFns = [...byFn.entries()].filter(([k]) => k.includes("@colyseus/schema")).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [k, v] of schemaFns) console.log(`  ${String(v).padStart(6)} hits ${(v / total * 100).toFixed(2).padStart(5)}%  ${k.split("@")[0]}`);

/**
 * 快照路径成本拆解：world.step / syncState(含 mechSnapshot) / schema encode(20Hz)。
 * 用真实 RoomState + Encoder + 真实关卡负载（R2 量化：sync+encode 占 tick ≤2%）。
 *
 * 2026-10-18（bench 槽 r0 基线）口径修正：RoomState 0.3.25 起新增 hangings/pulleys/romans
 * 三张下发表且平台带 state 字段——本基准的 buildState/syncState 原先只建 0.3.24 时代的
 * 7 张表，量出的树比生产小。现与 ForestRoom.syncState（60Hz 出站前的那份）逐字段同构；
 * 编码率维持头部声明的 20Hz（历史可比）；20Hz vs 60Hz 出站对比另见 perf-serialize.mjs。
 * 新增 --save/--compare 快照（与其余 perf 系同款），产物 benchmark/results/sync-<label>.json。
 *
 * 用法：
 *   node --import tsx benchmark/perf-sync.mjs                     # 跑分打印
 *   node --import tsx benchmark/perf-sync.mjs --save <label>      # 存快照
 *   node --import tsx benchmark/perf-sync.mjs --compare <label>   # 与快照对比
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../packages/server/src/rooms/state.js";
import { Encoder } from "@colyseus/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const LEVELS = process.env.PERF_SYNC_LEVELS ? process.env.PERF_SYNC_LEVELS.split(",").map((s) => s.trim()) : ["forest_01", "forest_bonus_2"];

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

const ROLES = ["fireboy", "watergirl"];

function buildState(world) {
  const state = new RoomState();
  for (const role of ROLES) state.players.set(role, new PlayerState());
  for (const d of world.diamonds) state.diamonds.set(d.id, new DiamondState());
  const snap = world.mechSnapshot();
  for (const l of snap.levers) state.levers.set(String(l.id), new LeverState());
  for (const p of snap.pushers) state.pushers.set(String(p.id), new PusherState());
  for (const p of snap.platforms) state.platforms.set(String(p.id), new BodyState());
  for (const p of snap.props) state.props.set(`${p.kind}:${p.id}`, new BodyState());
  for (const wd of snap.winds) state.winds.set(String(wd.id), new WindState());
  // 0.3.25 起的三张位姿表（此前缺建=量出的树比生产小）
  for (const h of snap.hangings) state.hangings.set(String(h.id), new BodyState());
  for (const p of snap.pulleys) {
    state.pulleys.set(`u${p.id}a`, new BodyState());
    state.pulleys.set(`u${p.id}b`, new BodyState());
  }
  for (const r of snap.romans) state.romans.set(String(r.id), new BodyState());
  return state;
}

/** 与 ForestRoom.syncState 同构（全量写；setter 对相同值短路） */
function syncState(world, state) {
  const snap = world.mechSnapshot();
  for (const role of ROLES) {
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

const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };

const rows = [];
for (const levelId of LEVELS) {
  const world = new World(loadLevel(levelId).level);
  const state = buildState(world);
  const encoder = new Encoder(state);
  const counts = {
    players: state.players.size, diamonds: state.diamonds.size, levers: state.levers.size,
    pushers: state.pushers.size, platforms: state.platforms.size, props: state.props.size,
    winds: state.winds.size, hangings: state.hangings.size, pulleys: state.pulleys.size, romans: state.romans.size,
  };
  // 预热
  for (let i = 0; i < 120; i++) { world.step(1 / 60, inputs); syncState(world, state); encoder.encode(); }
  const N = 600;
  let tStep = 0, tSync = 0, tEnc = 0, encBytes = 0, encNonEmpty = 0;
  // 20Hz 编码（每 3 tick 一次），历史口径与 2026-10-08 报告可比
  for (let i = 0; i < N; i++) {
    let t = performance.now();
    world.step(1 / 60, inputs);
    tStep += performance.now() - t;
    t = performance.now();
    syncState(world, state);
    tSync += performance.now() - t;
    if (i % 3 === 2) {
      t = performance.now();
      const bytes = encoder.encode();
      tEnc += performance.now() - t;
      if (bytes) { encBytes += bytes.length; encNonEmpty++; }
    }
  }
  const nEnc = N / 3;
  const row = {
    levelId,
    entities: counts,
    stepMs: +(tStep / N).toFixed(4),
    syncMs: +(tSync / N).toFixed(4),
    enc20HzMs: +(tEnc / nEnc).toFixed(4),
    avgPatchBytes: +(encBytes / Math.max(1, encNonEmpty)).toFixed(0),
    encNonEmptyRate: +(encNonEmpty / nEnc).toFixed(2),
  };
  rows.push(row);
  console.log(`${levelId}: step=${row.stepMs}ms sync=${row.syncMs}ms encode(20Hz)=${row.enc20HzMs}ms 平均patch=${row.avgPatchBytes}B 非空率=${(row.encNonEmptyRate * 100).toFixed(0)}%  条目=${JSON.stringify(counts)}`);
}

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    note: "buildState/syncState 与 ForestRoom.syncState 同构（含 0.3.25 hangings/pulleys/romans）；编码 20Hz",
    node: process.version,
  },
  rows,
};

if (argSave) {
  writeFileSync(join(RESULTS, `sync-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`已存档 sync-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `sync-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  for (const cur of rows) {
    const ref = base.rows.find((r) => r.levelId === cur.levelId);
    if (!ref) { console.log(`${cur.levelId}: 快照缺失`); continue; }
    const fmt = (a, b) => `${a.toFixed(4)} → ${b.toFixed(4)}`;
    console.log(`${cur.levelId}: step ${fmt(ref.stepMs, cur.stepMs)}  sync ${fmt(ref.syncMs, cur.syncMs)}  enc20 ${fmt(ref.enc20HzMs, cur.enc20HzMs)}  patch ${ref.avgPatchBytes} → ${cur.avgPatchBytes}B`);
  }
}

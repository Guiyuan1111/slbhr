/**
 * Colyseus 状态序列化/广播开销基准：真实 ForestRoom state schema 逐 tick encode+diff，
 * 20Hz vs 60Hz 出站对比（netopt 槽 patch 率决策供数）。
 *
 * 方法（与生产同构，诚实口径）：
 * - 服务端侧：真实 RoomState（packages/server/src/rooms/state.js）+ Encoder，字段写入与
 *   ForestRoom.syncState 逐字段同构；patch 生成 = encoder.encode({offset:1})，与
 *   @colyseus/core SchemaSerializer.applyPatches 的无 filter 路径同一调用（RoomState 无
 *   @filter → 单份 patch 全客户端广播；生产在此之后是 client.raw(bytes) 的 ws 出站，本基准
 *   不含 ws/网络层，带宽按 bytes×客户端数换算）。
 * - 客户端侧：Reflection.encode/decode 构造反射态（colyseus.js SchemaSerializer.handshake
 *   同款）+ Decoder.decode(patch)，即真实浏览器解码路径的 CPU 部分。
 * - 负载：真实关卡 World（@fw/shared/kernel）+ 确定性 scripted 输入（perf-determinism 同款
 *   发生器），syncState 每 tick 全量写（setter 对同值短路，无假增量）。
 * - 全部 schema 类经 createRequire 走 CJS 实例（与 colyseus 主包共享注册表；
 *   ESM 直引会拿到第二实例——colyseus.cjs.ts 头注释记载的坑）。
 * - 等价校验：预热后客户端反射态与服务端态抽查字段直读比对（|Δ|≤1e-6），不等即退出非 0。
 *
 * 用法：
 *   node --import tsx benchmark/perf-serialize.mjs                     # 跑分打印
 *   node --import tsx benchmark/perf-serialize.mjs --save <label>      # 存快照
 *   node --import tsx benchmark/perf-serialize.mjs --compare <label>   # 与快照对比
 *   PERF_SER_LEVELS=forest_01,forest_bonus_2 PERF_SER_INPUTS=idle|scripted 可覆盖
 * 产物：benchmark/results/serialize-<label>.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";
import { createRequire } from "node:module";
import { loadLevel } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../packages/server/src/rooms/state.js";

// 与生产同源的 CJS schema 实例（Encoder/Reflection 同表）
const require = createRequire(import.meta.url);
const { Encoder, Reflection } = require("@colyseus/schema");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const LEVELS = process.env.PERF_SER_LEVELS
  ? process.env.PERF_SER_LEVELS.split(",").map((s) => s.trim())
  : ["forest_01", "forest_12", "forest_bonus_2"];
const INPUT_MODE = process.env.PERF_SER_INPUTS ?? "scripted";
const TICKS = Number(process.env.PERF_SER_TICKS ?? 600);
const WARMUP = 120;

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  return { avg, p50: q(50), p95: q(95), p99: q(99), max: s[s.length - 1] };
}

/** 确定性输入（perf-determinism scripted 同款发生器；idle 模式全空） */
function scriptInputs(mode, step) {
  if (mode === "idle") {
    return { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };
  }
  const phase = step % 37;
  const fb = { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 };
  const wg = { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 };
  return { fireboy: fb, watergirl: wg };
}

/** 与 ForestRoom.syncState 同构的初始建树（0.3.25 全表） */
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

/** 与 ForestRoom.syncState 逐字段同构的每 tick 全量写 */
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

/** 组装一套服务端态+编码器+客户端反射解码器（生产握手流：反射→全量→增量）。
 * 生产字节口径：getFullState 用 encodeAll({offset:1})、patch 用 encode({offset:1})，
 * 返回的 subarray 都含 [0] 协议字节，客户端一律 decode(bytes, {offset:1})——偏移差 1
 * 字节即解码错位（实测：field-not-defined 警告+字段丢失）。 */
function makePair(levelId) {
  const world = new World(loadLevel(levelId).level);
  const state = buildState(world);
  const encoder = new Encoder(state);
  const clientDec = Reflection.decode(Reflection.encode(encoder));
  const full = encoder.encodeAll({ offset: 1 }); // 握手全量（SchemaSerializer.getFullState 同款）
  clientDec.decode(full, { offset: 1 });
  return { world, state, encoder, clientDec, fullStateBytes: full.length };
}

/** 生产 applyPatches 同款：[0]=协议字节 + encode({offset:1}) + 客户端 offset 1 解码 */
function encodePatch(encoder, clientDec) {
  encoder.sharedBuffer[0] = 0; // Protocol.ROOM_STATE_PATCH 的占位（值不影响字节计账）
  const bytes = encoder.encode({ offset: 1 });
  clientDec.decode(bytes, { offset: 1 });
  return bytes;
}

/** 客户端反射态 vs 服务端态抽查等价（字段直读）。
 * number 字段线上走 float32（msgpack 0xCA），0.1 量化速度值必有 ~1e-5 级量化差——容差取 1e-4。 */
function verifyPair(state, clientState) {
  const near = (a, b) => Math.abs(a - b) <= 1e-4;
  const ps = state.players.get("fireboy"), pc = clientState.players.get("fireboy");
  const ok =
    clientState.phase === state.phase &&
    clientState.levelId === state.levelId &&
    near(ps.x, pc.x) && near(ps.y, pc.y) && near(ps.vx, pc.vx) && near(ps.vy, pc.vy) &&
    ps.anim === pc.anim &&
    clientState.players.size === state.players.size &&
    clientState.platforms.size === state.platforms.size &&
    clientState.props.size === state.props.size &&
    near(state.timerMs, clientState.timerMs);
  if (!ok) {
    const checks = {
      phase: clientState.phase === state.phase,
      levelId: clientState.levelId === state.levelId,
      xy: near(ps.x, pc?.x) && near(ps.y, pc?.y),
      vxy: near(ps.vx, pc?.vx) && near(ps.vy, pc?.vy),
      anim: ps.anim === pc?.anim,
      playersSize: clientState.players.size === state.players.size,
      platformsSize: clientState.platforms.size === state.platforms.size,
      propsSize: clientState.props.size === state.props.size,
      timerMs: near(state.timerMs, clientState?.timerMs),
    };
    console.error("等价校验失败：", JSON.stringify(checks),
      "服务端", JSON.stringify({ x: ps.x, y: ps.y, anim: ps.anim, timerMs: state.timerMs }),
      "客户端", JSON.stringify({ x: pc?.x, y: pc?.y, anim: pc?.anim, timerMs: clientState?.timerMs }));
    process.exit(1);
  }
}

/** 一轮测量：grid=每多少 tick 编码一次（20 → 3 tick 一次；60 → 每 tick） */
function measure(levelId, grid) {
  const { world, state, encoder, clientDec, fullStateBytes } = makePair(levelId);
  // 预热：步进+syncState+按 grid 编码+解码（前两次 encode 会重放初始变更树，弃用）
  let tick = 0;
  for (let i = 0; i < WARMUP; i++, tick++) {
    world.step(1 / 60, scriptInputs(INPUT_MODE, tick));
    syncState(world, state);
    if (i % (60 / grid) === 60 / grid - 1) {
      encodePatch(encoder, clientDec);
    }
  }
  verifyPair(state, clientDec.state);
  const stepMs = [], syncMs = [], encMs = [], decMs = [], patchBytes = [];
  let patches = 0;
  for (let i = 0; i < TICKS; i++, tick++) {
    const inp = scriptInputs(INPUT_MODE, tick);
    let t = performance.now();
    world.step(1 / 60, inp);
    stepMs.push(performance.now() - t);
    t = performance.now();
    syncState(world, state);
    syncMs.push(performance.now() - t);
    if (i % (60 / grid) === 60 / grid - 1) {
      t = performance.now();
      encoder.sharedBuffer[0] = 0;
      const bytes = encoder.encode({ offset: 1 });
      encMs.push(performance.now() - t);
      t = performance.now();
      clientDec.decode(bytes, { offset: 1 });
      decMs.push(performance.now() - t);
      patchBytes.push(bytes.length);
      patches++;
    }
  }
  const se = stats(encMs), sd = stats(decMs), sb = stats(patchBytes), ss = stats(stepMs), sy = stats(syncMs);
  return {
    levelId, gridHz: grid, ticks: TICKS, patches, fullStateBytes,
    entities: {
      players: state.players.size, diamonds: state.diamonds.size, levers: state.levers.size,
      pushers: state.pushers.size, platforms: state.platforms.size, props: state.props.size,
      winds: state.winds.size, hangings: state.hangings.size, pulleys: state.pulleys.size, romans: state.romans.size,
    },
    stepAvgMs: +ss.avg.toFixed(4),
    syncAvgMs: +sy.avg.toFixed(4),
    encAvgMs: +se.avg.toFixed(4), encP95Ms: +se.p95.toFixed(4), encP99Ms: +se.p99.toFixed(4),
    decAvgMs: +sd.avg.toFixed(4), decP95Ms: +sd.p95.toFixed(4), decP99Ms: +sd.p99.toFixed(4),
    patchAvgBytes: +sb.avg.toFixed(0), patchP95Bytes: sb.p95, patchMaxBytes: sb.max,
    /** 编码 CPU 每仿真秒（60 步）：≈ encAvgMs×grid */
    encCpuMsPerSimSec: +(se.avg * grid).toFixed(2),
    decCpuMsPerSimSec: +(sd.avg * grid).toFixed(2),
    /** 单客户端线路字节每仿真秒（KB）；×2 得双客户端 */
    wireKBPerSimSec: +((sb.avg * grid) / 1024).toFixed(2),
  };
}

const rows = [];
for (const levelId of LEVELS) {
  for (const grid of [20, 60]) {
    const r = measure(levelId, grid);
    rows.push(r);
    console.log(
      `${levelId.padEnd(16)} ${String(r.gridHz).padStart(2)}Hz enc=${r.encAvgMs.toFixed(4)}ms(p95=${r.encP95Ms}) dec=${r.decAvgMs.toFixed(4)}ms patch=${r.patchAvgBytes}B(p95=${r.patchP95Bytes}) encCPU/仿真秒=${r.encCpuMsPerSimSec}ms 线路=${r.wireKBPerSimSec}KB/s/客户端 全量=${r.fullStateBytes}B`,
    );
  }
}

const payload = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0]?.model ?? "",
    loadavg: os.loadavg().map((v) => +v.toFixed(2)),
    inputs: INPUT_MODE,
    ticks: TICKS,
    method: "服务端 encoder.encode({offset:1})（SchemaSerializer.applyPatches 无 filter 同款调用，不含 ws 出站）+ 客户端 Reflection/Decoder.decode；字段写入与 ForestRoom.syncState 同构",
  },
  rows,
};

console.log("\n=== 20Hz vs 60Hz 对照（同关同负载）===");
for (const levelId of LEVELS) {
  const r20 = rows.find((r) => r.levelId === levelId && r.gridHz === 20);
  const r60 = rows.find((r) => r.levelId === levelId && r.gridHz === 60);
  console.log(
    `${levelId.padEnd(16)} encCPU/仿真秒 ${r20.encCpuMsPerSimSec} → ${r60.encCpuMsPerSimSec}ms（×${(r60.encCpuMsPerSimSec / Math.max(r20.encCpuMsPerSimSec, 1e-9)).toFixed(1)}）  线路 ${r20.wireKBPerSimSec} → ${r60.wireKBPerSimSec}KB/s/客户端（×${(r60.wireKBPerSimSec / Math.max(r20.wireKBPerSimSec, 1e-9)).toFixed(1)}）  patch ${r20.patchAvgBytes} → ${r60.patchAvgBytes}B`,
  );
}

if (argSave) {
  writeFileSync(join(RESULTS, `serialize-${argSave}.json`), JSON.stringify(payload, null, 2));
  console.log(`已存档 serialize-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `serialize-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${payload.meta.git}）=====`);
  for (const cur of rows) {
    const ref = base.rows.find((r) => r.levelId === cur.levelId && r.gridHz === cur.gridHz);
    if (!ref) { console.log(`${cur.levelId}@${cur.gridHz}Hz: 快照缺失`); continue; }
    const d = ((cur.encAvgMs - ref.encAvgMs) / Math.max(ref.encAvgMs, 1e-9)) * 100;
    console.log(`${cur.levelId.padEnd(16)} ${String(cur.gridHz).padStart(2)}Hz enc ${ref.encAvgMs.toFixed(4)} → ${cur.encAvgMs.toFixed(4)}ms（${d >= 0 ? "+" : ""}${d.toFixed(1)}%） patch ${ref.patchAvgBytes} → ${cur.patchAvgBytes}B`);
  }
}

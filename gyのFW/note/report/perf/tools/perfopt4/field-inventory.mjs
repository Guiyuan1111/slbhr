/**
 * r4 快照字段盘点：逐 tick diff 全部 schema 叶字段，统计每字段变更频率（idle/scripted），
 * 并用 @colyseus/schema 导出的 encode.number/string 量出每字段编码字节数（近似归因：
 * 1B 字段索引 + 值编码长度；实例头 SWITCH+refId 不摊到字段）。
 * 用法：node --import tsx TEMP/perfopt4/field-inventory.mjs [levelId] [idle|scripted]
 */
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { loadLevel } from "../../../../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../../../../../packages/server/src/rooms/state.js";

const require = createRequire(import.meta.url);
const { Encoder, encode } = require("@colyseus/schema");

const levelId = process.argv[2] ?? "forest_01";
const MODE = process.argv[3] ?? "scripted";
const TICKS = 600;

function scriptInputs(step) {
  if (MODE === "idle") return { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };
  const phase = step % 37;
  const fb = { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 };
  const wg = { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 };
  return { fireboy: fb, watergirl: wg };
}

// buildState/syncState 与 prof-encode.mjs 同构（复制）
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

// ---- 叶字段读取器：table -> [key, field, getter] ----
const TABLES = ["players", "diamonds", "levers", "pushers", "platforms", "props", "winds", "hangings", "pulleys", "romans"];
function readAll(state) {
  const out = new Map();
  for (const t of TABLES) {
    for (const [k, v] of state[t]) {
      for (const f of Object.keys(v.constructor[Symbol.metadata] ?? {}).map((i) => v.constructor[Symbol.metadata][i].name)) {
        out.set(`${t}.${k}.${f}`, v[f]);
      }
    }
  }
  for (const f of Object.keys(state.doors.constructor[Symbol.metadata] ?? {}).map((i) => state.doors.constructor[Symbol.metadata][i].name)) {
    out.set(`doors.${f}`, state.doors[f]);
  }
  for (const f of ["phase", "levelId", "timerMs"]) out.set(`root.${f}`, state[f]);
  return out;
}

// 值编码字节数（与 number$1/string$1 返回一致；boolean=1）
const scratch = Buffer.allocUnsafe(64);
function valueBytes(v) {
  const it = { offset: 0 };
  if (typeof v === "number") return encode.number(scratch, v, it);
  if (typeof v === "boolean") return 1;
  if (typeof v === "string") { const it2 = { offset: 0 }; return encode.string(scratch, v, it2); }
  return 0;
}

const world = new World(loadLevel(levelId).level);
const state = buildState(world);
const encoder = new Encoder(state);

// 预热 120 tick（JIT + 动画状态进入稳态）
for (let i = 0; i < 120; i++) {
  world.step(1 / 60, scriptInputs(i));
  syncState(world, state);
  encoder.encode({ offset: 1 });
  encoder.discardChanges();
}

let prev = readAll(state);
const changeCount = new Map(); // field path -> {n, bytes}
const bytesByTable = new Map();
const patchBytesPerTick = [];
let nonEmpty = 0;

for (let i = 0; i < TICKS; i++) {
  world.step(1 / 60, scriptInputs(i + 120));
  syncState(world, state);
  encoder.sharedBuffer[0] = 0;
  const bytes = encoder.encode({ offset: 1 });
  encoder.discardChanges();
  if (bytes.length > 1) { nonEmpty++; patchBytesPerTick.push(bytes.length); } else patchBytesPerTick.push(0);
  const cur = readAll(state);
  for (const [k, v] of cur) {
    if (v !== prev.get(k)) {
      const e = changeCount.get(k) ?? { n: 0, bytes: 0 };
      e.n++;
      e.bytes += 1 + valueBytes(v); // 字段索引字节 + 值
      changeCount.set(k, e);
      const t = k.split(".")[0];
      bytesByTable.set(t, (bytesByTable.get(t) ?? 0) + 1 + valueBytes(v));
    }
  }
  prev = cur;
}

console.log(`\n=== ${levelId} ${MODE} ${TICKS} ticks：非空 patch ${nonEmpty}/${TICKS}，patch 均值 ${(patchBytesPerTick.reduce((a, b) => a + b, 0) / TICKS).toFixed(0)}B（非空口径 ${(patchBytesPerTick.filter((b) => b > 0).reduce((a, b) => a + b, 0) / Math.max(nonEmpty, 1)).toFixed(0)}B）===`);
console.log("\n按字段聚合（同一表所有实体合并；Δ/tick=每 tick 平均变更实体数，B/tick=字段索引+值字节）：");
const byField = new Map();
for (const [k, e] of changeCount) {
  const [t, , f] = k.split(".");
  const key = `${t}.${f}`;
  const a = byField.get(key) ?? { n: 0, bytes: 0 };
  a.n += e.n; a.bytes += e.bytes;
  byField.set(key, a);
}
for (const [k, a] of [...byField.entries()].sort((x, y) => y[1].bytes - x[1].bytes)) {
  console.log(`  ${k.padEnd(22)} Δ/tick=${(a.n / TICKS).toFixed(2).padStart(7)}  B/tick=${(a.bytes / TICKS).toFixed(1).padStart(7)}  总变更 ${a.n}`);
}
console.log("\n按表聚合 B/tick：");
let tot = 0;
for (const [t, b] of [...bytesByTable.entries()].sort((x, y) => y[1] - x[1])) {
  tot += b;
  console.log(`  ${t.padEnd(12)} ${(b / TICKS).toFixed(1)} B/tick`);
}
console.log(`  （字段层合计 ${(tot / TICKS).toFixed(1)} B/tick；patch 实际含实例头 SWITCH+refId 与集合键）`);

/**
 * 件2 候选 A/B：schema 类 static [$filter] 遮蔽为 undefined（声明侧），
 * 对照 vendor 缺省（继承 Schema 的 $filter，逐字段调用查 tag）。
 * 生产口径（encode 后 discardChanges）。字节等价断言 + 计时 7 轮中位。
 */
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { loadLevel } from "../../../../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState, DoorState } from "../../../../../packages/server/src/rooms/state.js";

const require = createRequire(import.meta.url);
const { Encoder } = require("@colyseus/schema");

const SCHEMA_CLASSES = [RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState, DoorState];
const $filter = "~filter";

function scriptInputs(step) {
  const phase = step % 37;
  const fb = { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 };
  const wg = { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 };
  return { fireboy: fb, watergirl: wg };
}
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
  for (const p of snap.pulleys) { state.pulleys.set(`u${p.id}a`, new BodyState()); state.pulleys.set(`u${p.id}b`, new BodyState()); }
  for (const r of snap.romans) state.romans.set(String(r.id), new BodyState());
  return state;
}
function syncState(world, state) {
  const snap = world.mechSnapshot();
  for (const role of ["fireboy", "watergirl"]) {
    const sim = world.snapshotPlayer(role);
    const ps = state.players.get(role);
    ps.x = Math.round(sim.x * 10) / 10; ps.y = Math.round(sim.y * 10) / 10;
    ps.vx = Math.round(sim.vx * 10) / 10; ps.vy = Math.round(sim.vy * 10) / 10;
    ps.facing = sim.facing; ps.anim = sim.anim; ps.headTilt = Math.round(sim.headTilt * 1000) / 1000;
    ps.inLiquid = sim.inLiquid; ps.dying = sim.dying; ps.dead = sim.dead; ps.isDead = sim.isDead;
    ps.atDoor = sim.atDoor; ps.doorFrame = sim.doorFrame; ps.doorUp = sim.doorUp;
  }
  for (const d of world.diamonds) state.diamonds.get(d.id).collected = d.collected;
  for (const l of snap.levers) { const ls = state.levers.get(String(l.id)); ls.group = l.group; ls.state = l.state; ls.angle = Math.round(l.angle * 1000) / 1000; }
  for (const p of snap.pushers) { const ps2 = state.pushers.get(String(p.id)); ps2.group = p.group; ps2.state = p.state; ps2.x = Math.round(p.x * 10) / 10; ps2.y = Math.round(p.y * 10) / 10; }
  for (const p of snap.platforms) { const bs = state.platforms.get(String(p.id)); bs.x = Math.round(p.x * 10) / 10; bs.y = Math.round(p.y * 10) / 10; bs.angle = Math.round(p.angle * 1000) / 1000; bs.state = p.state; }
  for (const p of snap.props) { const bs = state.props.get(`${p.kind}:${p.id}`); bs.x = Math.round(p.x * 10) / 10; bs.y = Math.round(p.y * 10) / 10; bs.angle = Math.round(p.angle * 1000) / 1000; }
  for (const wd of snap.winds) { const ws = state.winds.get(String(wd.id)); ws.group = wd.group; ws.state = wd.state; }
  for (const h of snap.hangings) { const bs = state.hangings.get(String(h.id)) ?? (state.hangings.set(String(h.id), new BodyState()), state.hangings.get(String(h.id))); bs.x = Math.round(h.x * 10) / 10; bs.y = Math.round(h.y * 10) / 10; bs.angle = Math.round(h.angle * 1000) / 1000; }
  for (const p of snap.pulleys) { for (const [s, pose] of [["a", p.a], ["b", p.b]]) { const bs = state.pulleys.get(`u${p.id}${s}`); bs.x = Math.round(pose.x * 10) / 10; bs.y = Math.round(pose.y * 10) / 10; bs.angle = Math.round(pose.angle * 1000) / 1000; } }
  for (const r of snap.romans) { const bs = state.romans.get(String(r.id)); bs.x = Math.round(r.x * 10) / 10; bs.y = Math.round(r.y * 10) / 10; bs.angle = Math.round(r.angle * 1000) / 1000; }
  const doors = world.doors;
  state.doors.fbAtDoor = doors.fireboy.isOpen; state.doors.wgAtDoor = doors.watergirl.isOpen;
  state.doors.fbFrame = doors.fireboy.frac; state.doors.wgFrame = doors.watergirl.frac;
  state.doors.fbUp = doors.fireboy.isUp; state.doors.wgUp = doors.watergirl.isUp;
  state.timerMs = Math.round(world.timerMs);
}

function setShadow(on) {
  for (const C of SCHEMA_CLASSES) {
    if (on) C[$filter] = undefined;
    else delete C[$filter];
  }
}

const GATE = process.argv.includes("--gate");
const levelId = GATE ? "forest_bonus_2" : (process.argv[2] ?? "forest_bonus_2");
const GATE_LEVELS = GATE ? ["forest_01", "forest_04", "forest_12", "forest_bonus_2"] : [levelId];
const ROUNDS = 9;

// 字节等价断言：同世界同写序，两模式各跑一遍，逐 patch + 逐帧 encodeAll 比对
function byteStream(level, shadow) {
  setShadow(shadow);
  const world = new World(loadLevel(level).level);
  const state = buildState(world);
  const encoder = new Encoder(state);
  const patches = [];
  const fulls = [];
  for (let i = 0; i < 600; i++) {
    world.step(1 / 60, scriptInputs(i));
    syncState(world, state);
    encoder.sharedBuffer[0] = 0;
    const b = encoder.encode({ offset: 1 });
    encoder.discardChanges();
    patches.push(Buffer.from(b));
    fulls.push(Buffer.from(encoder.encodeAll({ offset: 1 })));
  }
  return { patches, fulls };
}
for (const lv of GATE_LEVELS) {
  const a = byteStream(lv, false), b = byteStream(lv, true);
  if (a.patches.length !== b.patches.length) throw new Error(`${lv}: patch 数不一致`);
  for (let i = 0; i < a.patches.length; i++) {
    if (!a.patches[i].equals(b.patches[i])) throw new Error(`${lv} 第 ${i} 帧 patch 字节不等（${a.patches[i].length}B vs ${b.patches[i].length}B）`);
    if (!a.fulls[i].equals(b.fulls[i])) throw new Error(`${lv} 第 ${i} 帧 encodeAll 字节不等`);
  }
  console.log(`${lv}: 字节等价断言通过（600 patch + 600 encodeAll 逐字节相等）`);
}
if (GATE) { console.log("--gate 完成（仅字节门禁，不做计时）"); process.exit(0); }

// 交错计时 A/B（同进程同 JIT，mode 交替 9 轮取中位）
const times = { false: [], true: [] };
for (let r = 0; r < ROUNDS; r++) {
  for (const shadow of r % 2 === 0 ? [false, true] : [true, false]) {
    setShadow(shadow);
    const world = new World(loadLevel(levelId).level);
    const state = buildState(world);
    const encoder = new Encoder(state);
    for (let i = 0; i < 120; i++) { world.step(1 / 60, scriptInputs(i)); syncState(world, state); encoder.encode({ offset: 1 }); encoder.discardChanges(); }
    let total = 0;
    for (let i = 0; i < 600; i++) {
      world.step(1 / 60, scriptInputs(i + 120));
      syncState(world, state);
      const t = performance.now();
      encoder.sharedBuffer[0] = 0;
      encoder.encode({ offset: 1 });
      encoder.discardChanges();
      total += performance.now() - t;
    }
    times[String(shadow)].push(total / 600);
  }
}
const med = (arr) => [...arr].sort((x, y) => x - y)[Math.floor(arr.length / 2)];
const base = med(times["false"]), opt = med(times["true"]);
console.log(`enc/tick: vendor缺省=${base.toFixed(5)}ms  $filter遮蔽=${opt.toFixed(5)}ms  Δ=${(((base - opt) / base) * 100).toFixed(1)}%（9 轮中位，交错 A/B）`);

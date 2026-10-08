/**
 * 快照路径成本拆解：world.step / syncState(含 mechSnapshot) / schema encode(20Hz)。
 * 用真实 RoomState + Encoder + 真实关卡负载（R2 量化：sync+encode 占 tick ≤2%）。
 *
 * 用法：node --import tsx benchmark/perf-sync.mjs
 */
import { performance } from "node:perf_hooks";
import { loadLevel } from "../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../packages/server/src/rooms/state.js";
import { Encoder } from "@colyseus/schema";

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
  }
  for (const p of snap.props) {
    const bs = state.props.get(`${p.kind}:${p.id}`);
    bs.x = Math.round(p.x * 10) / 10; bs.y = Math.round(p.y * 10) / 10; bs.angle = Math.round(p.angle * 1000) / 1000;
  }
  for (const wd of snap.winds) {
    const ws = state.winds.get(String(wd.id));
    ws.group = wd.group; ws.state = wd.state;
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

for (const levelId of ["forest_01", "forest_bonus_2"]) {
  const world = new World(loadLevel(levelId).level);
  const state = buildState(world);
  const encoder = new Encoder(state);
  // 预热
  for (let i = 0; i < 120; i++) { world.step(1 / 60, inputs); syncState(world, state); encoder.encode(); }
  const N = 600;
  let tStep = 0, tSync = 0, tEnc = 0, encBytes = 0, encNonEmpty = 0;
  // 20Hz 编码（每 3 tick 一次），与真实房间一致
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
  console.log(`${levelId}: step=${(tStep / N).toFixed(4)}ms sync=${(tSync / N).toFixed(4)}ms encode(20Hz)=${(tEnc / (N / 3)).toFixed(4)}ms 平均patch=${(encBytes / Math.max(1, encNonEmpty)).toFixed(0)}B 非空率=${((encNonEmpty / (N / 3)) * 100).toFixed(0)}%`);
}

/**
 * 验证：基准 harness 不调 encoder.discardChanges() 时 patch 是否=自始变更并集（非生产每 tick 增量）。
 * 对照：A=不 discard（perf-serialize/perf-sync 现状）vs B=每 encode 后 discard（生产 applyPatches 同款）。
 */
import { createRequire } from "node:module";
import { loadLevel } from "../../../../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../../../../../packages/server/src/rooms/state.js";

const require = createRequire(import.meta.url);
const { Encoder } = require("@colyseus/schema");

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
  for (const h of snap.hangings) { const bs = state.hangings.get(String(h.id)); bs.x = Math.round(h.x * 10) / 10; bs.y = Math.round(h.y * 10) / 10; bs.angle = Math.round(h.angle * 1000) / 1000; }
  for (const p of snap.pulleys) { for (const [s, pose] of [["a", p.a], ["b", p.b]]) { const bs = state.pulleys.get(`u${p.id}${s}`); bs.x = Math.round(pose.x * 10) / 10; bs.y = Math.round(pose.y * 10) / 10; bs.angle = Math.round(pose.angle * 1000) / 1000; } }
  for (const r of snap.romans) { const bs = state.romans.get(String(r.id)); bs.x = Math.round(r.x * 10) / 10; bs.y = Math.round(r.y * 10) / 10; bs.angle = Math.round(r.angle * 1000) / 1000; }
  const doors = world.doors;
  state.doors.fbAtDoor = doors.fireboy.isOpen; state.doors.wgAtDoor = doors.watergirl.isOpen;
  state.doors.fbFrame = doors.fireboy.frac; state.doors.wgFrame = doors.watergirl.frac;
  state.doors.fbUp = doors.fireboy.isUp; state.doors.wgUp = doors.watergirl.isUp;
  state.timerMs = Math.round(world.timerMs);
}

for (const levelId of ["forest_01", "forest_12", "forest_bonus_2"]) {
  for (const discard of [false, true]) {
    const world = new World(loadLevel(levelId).level);
    const state = buildState(world);
    const encoder = new Encoder(state);
    for (let i = 0; i < 120; i++) { world.step(1 / 60, scriptInputs(i)); syncState(world, state); encoder.encode({ offset: 1 }); if (discard) encoder.discardChanges(); }
    let total = 0, n = 0, nonEmpty = 0, emptyRun = 0;
    for (let i = 0; i < 600; i++) {
      world.step(1 / 60, scriptInputs(i + 120));
      syncState(world, state);
      encoder.sharedBuffer[0] = 0;
      const bytes = encoder.encode({ offset: 1 });
      if (discard) encoder.discardChanges();
      total += bytes.length; n++;
      if (bytes.length > 1) nonEmpty++; else emptyRun++;
    }
    console.log(`${levelId.padEnd(16)} discard=${String(discard).padEnd(5)} patch均值=${(total / n).toFixed(0)}B 非空=${nonEmpty}/${n} 空=${emptyRun}`);
  }
}

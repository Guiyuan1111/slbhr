/**
 * 生产口径 encode 计时：每 encode 后 discardChanges（applyPatches 同款）。
 * 对照 r0 口径（无 discard）。单位 ms/tick@60Hz 网格 + 每仿真秒。
 */
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { loadLevel } from "../../../../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../../../../../packages/server/src/rooms/state.js";

const require = createRequire(import.meta.url);
const { Encoder } = require("@colyseus/schema");

function scriptInputs(step, mode) {
  if (mode === "idle") return { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };
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

const ROUNDS = 7;
for (const levelId of ["forest_01", "forest_12", "forest_bonus_2"]) {
  const res = { prod: [], r0: [], idle: [] };
  for (let r = 0; r < ROUNDS; r++) {
    for (const [variant, discard, mode] of [["prod", true, "scripted"], ["r0", false, "scripted"], ["idle", true, "idle"]]) {
      const world = new World(loadLevel(levelId).level);
      const state = buildState(world);
      const encoder = new Encoder(state);
      for (let i = 0; i < 120; i++) { world.step(1 / 60, scriptInputs(i, mode)); syncState(world, state); encoder.encode({ offset: 1 }); if (discard) encoder.discardChanges(); }
      const encMs = [];
      let bytes = 0;
      for (let i = 0; i < 600; i++) {
        world.step(1 / 60, scriptInputs(i + 120, mode));
        syncState(world, state);
        const t = performance.now();
        encoder.sharedBuffer[0] = 0;
        const b = encoder.encode({ offset: 1 });
        encMs.push(performance.now() - t);
        if (discard) encoder.discardChanges();
        bytes += b.length;
      }
      res[variant].push({ enc: encMs.reduce((a, b) => a + b, 0) / encMs.length, bytes: bytes / 600 });
    }
  }
  const med = (arr, f) => [...arr].sort((a, b) => a[f] - b[f])[Math.floor(arr.length / 2)];
  const p = med(res.prod, "enc"), z = med(res.r0, "enc"), id = med(res.idle, "enc");
  console.log(`${levelId.padEnd(16)} 生产口径(discard): enc=${p.enc.toFixed(4)}ms/tick (=${(p.enc * 60).toFixed(2)}ms/仿真秒) patch=${med(res.prod, "bytes").bytes.toFixed(0)}B | r0口径(累积): enc=${z.enc.toFixed(4)}ms patch=${med(res.r0, "bytes").bytes.toFixed(0)}B | idle生产: enc=${id.enc.toFixed(4)}ms patch=${med(res.idle, "bytes").bytes.toFixed(0)}B`);
}

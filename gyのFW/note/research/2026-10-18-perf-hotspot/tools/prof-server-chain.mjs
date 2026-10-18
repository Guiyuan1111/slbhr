/**
 * [hotspot 槽] 服务器 tick 链 headless 剖析驱动（产品代码零改动）。
 * 复刻 ForestRoom.tick 的热路径三段：world.step → syncState（World→Schema 全量写）
 * → Colyseus Encoder.encode()（增量编码，等价 broadcastPatch 的出站侧）。
 * syncState 逻辑按 ForestRoom.ts L410-536 逐行镜像（先预建 schema 条目=稳态无 new 分支）。
 *
 * 用法：
 *   node --import tsx TEMP/hotspot/prof-server-chain.mjs
 *   HS_TICKS=12000 HS_LEVEL=forest_01 node --import tsx ...
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { loadLevel } from "../../packages/server/src/levels.js";
import { World } from "@fw/shared/kernel";
import { RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState } from "../../packages/server/src/rooms/state.js";

const require = createRequire(import.meta.url);
const { Encoder } = require("@colyseus/schema");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEVEL = process.env.HS_LEVEL ?? "forest_01";
const TICKS = Number(process.env.HS_TICKS ?? 12000);
const WARM = Number(process.env.HS_WARM ?? 300);

const doc = JSON.parse(readFileSync(join(ROOT, "scripts", "e2e", "inputs", "routes", `${LEVEL}.json`), "utf8"));
const FRAMES = doc.totalFrames;

function buildTrack(events) {
  const track = Array.from({ length: FRAMES + 1 }, () => ({ up: false, left: false, right: false }));
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
const state = new RoomState();
state.phase = "started";
state.levelId = LEVEL;

/** —— syncState 镜像（ForestRoom.ts L410-536；条目预建一次，之后等价稳态路径） —— */
const round10 = (v) => Math.round(v * 10) / 10;
const round1000 = (v) => Math.round(v * 1000) / 1000;
function syncStateMirror() {
  const snap = w.mechSnapshot();
  for (const role of ["fireboy", "watergirl"]) {
    const sim = w.snapshotPlayer(role);
    let ps = state.players.get(role);
    if (!ps) { ps = new PlayerState(); state.players.set(role, ps); }
    ps.x = round10(sim.x); ps.y = round10(sim.y);
    ps.vx = round10(sim.vx); ps.vy = round10(sim.vy);
    ps.facing = sim.facing; ps.anim = sim.anim;
    ps.headTilt = round1000(sim.headTilt);
    ps.inLiquid = sim.inLiquid; ps.dying = sim.dying; ps.dead = sim.dead; ps.isDead = sim.isDead;
    ps.atDoor = sim.atDoor; ps.doorFrame = sim.doorFrame; ps.doorUp = sim.doorUp;
  }
  for (const d of w.diamonds) {
    let ds = state.diamonds.get(d.id);
    if (!ds) { ds = new DiamondState(); state.diamonds.set(d.id, ds); }
    ds.collected = d.collected;
  }
  for (const l of snap.levers) {
    let ls = state.levers.get(String(l.id));
    if (!ls) { ls = new LeverState(); state.levers.set(String(l.id), ls); }
    ls.group = l.group; ls.state = l.state; ls.angle = round1000(l.angle);
  }
  for (const p of snap.pushers) {
    let ps = state.pushers.get(String(p.id));
    if (!ps) { ps = new PusherState(); state.pushers.set(String(p.id), ps); }
    ps.group = p.group; ps.state = p.state; ps.x = round10(p.x); ps.y = round10(p.y);
  }
  for (const p of snap.platforms) {
    let bs = state.platforms.get(String(p.id));
    if (!bs) { bs = new BodyState(); state.platforms.set(String(p.id), bs); }
    bs.x = round10(p.x); bs.y = round10(p.y); bs.angle = round1000(p.angle); bs.state = p.state;
  }
  for (const p of snap.props) {
    let bs = state.props.get(`${p.kind}:${p.id}`);
    if (!bs) { bs = new BodyState(); state.props.set(`${p.kind}:${p.id}`, bs); }
    bs.x = round10(p.x); bs.y = round10(p.y); bs.angle = round1000(p.angle);
  }
  for (const wd of snap.winds) {
    let ws = state.winds.get(String(wd.id));
    if (!ws) { ws = new WindState(); state.winds.set(String(wd.id), ws); }
    ws.group = wd.group; ws.state = wd.state;
  }
  for (const h of snap.hangings) {
    let bs = state.hangings.get(String(h.id));
    if (!bs) { bs = new BodyState(); state.hangings.set(String(h.id), bs); }
    bs.x = round10(h.x); bs.y = round10(h.y); bs.angle = round1000(h.angle);
  }
  for (const p of snap.pulleys) {
    for (const [suffix, pose] of [["a", p.a], ["b", p.b]]) {
      let bs = state.pulleys.get(`u${p.id}${suffix}`);
      if (!bs) { bs = new BodyState(); state.pulleys.set(`u${p.id}${suffix}`, bs); }
      bs.x = round10(pose.x); bs.y = round10(pose.y); bs.angle = round1000(pose.angle);
    }
  }
  for (const r of snap.romans) {
    let bs = state.romans.get(String(r.id));
    if (!bs) { bs = new BodyState(); state.romans.set(String(r.id), bs); }
    bs.x = round10(r.x); bs.y = round10(r.y); bs.angle = round1000(r.angle);
  }
  const doors = w.doors;
  state.doors.fbAtDoor = doors.fireboy.isOpen; state.doors.wgAtDoor = doors.watergirl.isOpen;
  state.doors.fbFrame = doors.fireboy.frac; state.doors.wgFrame = doors.watergirl.frac;
  state.doors.fbUp = doors.fireboy.isUp; state.doors.wgUp = doors.watergirl.isUp;
  state.timerMs = Math.round(w.timerMs);
}

// —— 预建 schema 条目（稳态服务器里这些早已存在） ——
syncStateMirror();
const encoder = new Encoder(state);
const full = encoder.encodeAll();
let fullBytes = full.length;

/** 三段分计时 tick：step / sync / encode */
let stepMs = 0, syncMs = 0, encodeMs = 0, patchBytes = 0, patchNonZero = 0, steps = 0, frame = 0;
const inputs = () => ({
  fireboy: fbTrack[Math.min(FRAMES, frame)],
  watergirl: wgTrack[Math.min(FRAMES, frame)],
});

for (let i = 0; i < WARM; i++) {
  w.step(1 / 60, inputs());
  syncStateMirror();
  encoder.encode();
}

let t = performance.now();
let replays = 0;
while (steps < TICKS) {
  if (w.phase !== "playing") { w.reset(); replays++; frame = 0; }
  const evs = w.step(1 / 60, inputs());
  t = performance.now() - t; stepMs += t;
  t = performance.now();
  syncStateMirror();
  syncMs += performance.now() - t;
  t = performance.now();
  const patch = encoder.encode();
  encodeMs += performance.now() - t;
  patchBytes += patch.length;
  if (patch.length > 0) patchNonZero++;
  steps++;
  frame++;
}

console.log(JSON.stringify({
  driver: "server-chain", level: LEVEL, ticks: steps,
  stepMs: +stepMs.toFixed(1), syncMs: +syncMs.toFixed(1), encodeMs: +encodeMs.toFixed(1),
  usPerTickStep: +((stepMs * 1000) / steps).toFixed(2),
  usPerTickSync: +((syncMs * 1000) / steps).toFixed(2),
  usPerTickEncode: +((encodeMs * 1000) / steps).toFixed(2),
  chainShare: {
    step: +(stepMs / (stepMs + syncMs + encodeMs) * 100).toFixed(1),
    sync: +(syncMs / (stepMs + syncMs + encodeMs) * 100).toFixed(1),
    encode: +(encodeMs / (stepMs + syncMs + encodeMs) * 100).toFixed(1),
  },
  fullStateBytes: fullBytes,
  avgPatchBytes: +(patchBytes / steps).toFixed(1),
  patchNonZeroRatio: +(patchNonZero / steps * 100).toFixed(1),
}));

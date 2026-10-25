/**
 * R12 光面性能基准（2026-10-25）：灯光神庙新增面的三段拆解。
 *
 * r0–r11 战役未覆盖的三个新面（0.3.45 引入）：
 *   A. 内核步进溢价——light 40 关（beamer raycast/rotmirror/slider 等逐帧）vs forest 抽样中位；
 *   B. 光机关分配率——beam 重关每 600 步的堆增量（--expose-gc 下 gc 后测量，零 gc 干扰）；
 *   C. 同步+encode——RoomState 全字段（含 light 七表）syncState 同构写 + Encoder patch 字节/CPU，
 *      light_02（有 beam 持续折线）对比 forest_01。
 *
 * 口径：A/B 沿 perf-step 同款（预热 90、步 600、stats p50/p95/p99/max）；C 沿 perf-sync 同款
 * （20Hz 编码率、每 encode 后 discardChanges 与生产同构）。syncState 以 ForestRoom.syncState
 * （0.3.45）逐字段同构复制——light 七表 forest 关恒空，编码零开销预期在此验证。
 *
 * 用法：
 *   node --import tsx benchmark/perf-light.mjs                     # 跑分打印
 *   node --import tsx benchmark/perf-light.mjs --save <label>      # 存快照
 *   node --expose-gc --import tsx benchmark/perf-light.mjs         # B 段启用 gc 精测
 * 产物：benchmark/results/perf-light-<label>.json
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { loadLevel, listLevelIds } from "../packages/server/src/levels.js";
import { World, m2px } from "@fw/shared/kernel";
import { EMPTY_INPUT } from "@fw/shared";
import {
  RoomState,
  PlayerState,
  DiamondState,
  LeverState,
  PusherState,
  BodyState,
  WindState,
  BeamState,
} from "../packages/server/src/rooms/state.js";
import { Encoder } from "@colyseus/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const STEPS = Number(process.env.PERF_LIGHT_STEPS ?? 600);
const WARMUP = 90;
const CAN_GC = typeof globalThis.gc === "function";

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const log = (...a) => console.log("[light]", ...a);

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  return { avg, p50: q(50), p95: q(95), p99: q(99), max: s[s.length - 1] };
}

const SCRIPTED = process.env.PERF_LIGHT_SCRIPTED === "1";
const inputs = { fireboy: { ...EMPTY_INPUT }, watergirl: { ...EMPTY_INPUT } };
let stepCounter = 0;
function stepInputs() {
  if (!SCRIPTED) return inputs;
  const phase = stepCounter % 37;
  stepCounter++;
  return {
    fireboy: { up: phase >= 10 && phase < 13, left: phase >= 20 && phase < 30, right: phase < 10 || phase >= 30 },
    watergirl: { up: phase >= 25 && phase < 28, left: phase < 15, right: phase >= 15 && phase < 25 },
  };
}

// ---------------- A. 步进溢价 ----------------
function stepSuite(ids) {
  const rows = [];
  for (const id of ids) {
    const t0 = performance.now();
    const w = new World(loadLevel(id).level);
    const buildMs = performance.now() - t0;
    for (let i = 0; i < WARMUP; i++) w.step(1 / 60, stepInputs());
    const stepMs = new Array(STEPS);
    for (let i = 0; i < STEPS; i++) {
      const t = performance.now();
      w.step(1 / 60, stepInputs());
      stepMs[i] = performance.now() - t;
    }
    const st = stats(stepMs);
    rows.push({ id, buildMs: +buildMs.toFixed(1), stepAvgMs: +st.avg.toFixed(4), stepP95Ms: +st.p95.toFixed(4), stepMaxMs: +st.max.toFixed(4) });
  }
  return rows;
}

// ---------------- B. 分配率（beam 重关）----------------
function allocRate(id) {
  const w = new World(loadLevel(id).level);
  for (let i = 0; i < WARMUP; i++) w.step(1 / 60, stepInputs());
  if (CAN_GC) globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < STEPS; i++) w.step(1 / 60, stepInputs());
  const after = process.memoryUsage().heapUsed;
  return { id, heapGrowthKBPer600: +((after - before) / 1024).toFixed(1), perStepB: +(((after - before) / STEPS)).toFixed(1) };
}

// ---------------- C. 同步+encode（ForestRoom.syncState 0.3.45 同构）----------------
function buildState(world) {
  const state = new RoomState();
  const sync = () => {
    const mechs = world.mechanisms;
    for (const role of ["fireboy", "watergirl"]) {
      const sim = world.snapshotPlayer(role);
      let ps = state.players.get(role);
      if (!ps) {
        ps = new PlayerState();
        state.players.set(role, ps);
      }
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
    for (const d of world.diamonds) {
      let ds = state.diamonds.get(d.id);
      if (!ds) {
        ds = new DiamondState();
        state.diamonds.set(d.id, ds);
      }
      ds.collected = d.collected;
    }
    for (let id = 0; id < mechs.levers.length; id++) {
      const l = mechs.levers[id];
      let ls = state.levers.get(String(id));
      if (!ls) {
        ls = new LeverState();
        state.levers.set(String(id), ls);
      }
      ls.group = l.group;
      ls.state = l.state;
      ls.angle = Math.round(((l.angleDeg() * Math.PI) / 180) * 1000) / 1000;
    }
    for (let id = 0; id < mechs.pushers.length; id++) {
      const p = mechs.pushers[id];
      let ps = state.pushers.get(String(id));
      if (!ps) {
        ps = new PusherState();
        state.pushers.set(String(id), ps);
      }
      ps.group = p.group;
      ps.state = p.state;
      const pos = p.body.GetPosition();
      ps.x = Math.round(m2px(pos.x) * 10) / 10;
      ps.y = Math.round(m2px(pos.y) * 10) / 10;
    }
    for (let id = 0; id < mechs.platforms.length; id++) {
      const p = mechs.platforms[id];
      let bs = state.platforms.get(String(id));
      if (!bs) {
        bs = new BodyState();
        state.platforms.set(String(id), bs);
      }
      const pos = p.body.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(-p.body.GetAngle() * 1000) / 1000;
      bs.state = p.state;
    }
    for (let id = 0; id < mechs.props.length; id++) {
      const p = mechs.props[id];
      const key = `${p.kind}:${id}`;
      let bs = state.props.get(key);
      if (!bs) {
        bs = new BodyState();
        state.props.set(key, bs);
      }
      const pos = p.body.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(-p.body.GetAngle() * 1000) / 1000;
    }
    for (let id = 0; id < mechs.winds.length; id++) {
      const wd = mechs.winds[id];
      let ws = state.winds.get(String(id));
      if (!ws) {
        ws = new WindState();
        state.winds.set(String(id), ws);
      }
      ws.group = wd.group;
      ws.state = wd.state;
    }
    for (let id = 0; id < mechs.hangings.length; id++) {
      const h = mechs.hangings[id];
      let bs = state.hangings.get(String(id));
      if (!bs) {
        bs = new BodyState();
        state.hangings.set(String(id), bs);
      }
      const pos = h.platform.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(h.platform.GetAngle() * 1000) / 1000;
    }
    for (let id = 0; id < mechs.pulleys.length; id++) {
      const p = mechs.pulleys[id];
      for (const [suffix, body] of [
        [`u${id}a`, p.plat1],
        [`u${id}b`, p.plat2],
      ]) {
        let bs = state.pulleys.get(suffix);
        if (!bs) {
          bs = new BodyState();
          state.pulleys.set(suffix, bs);
        }
        const pos = body.GetPosition();
        bs.x = Math.round(m2px(pos.x) * 10) / 10;
        bs.y = Math.round(m2px(pos.y) * 10) / 10;
        bs.angle = Math.round(body.GetAngle() * 1000) / 1000;
      }
    }
    for (let id = 0; id < mechs.romans.length; id++) {
      const r = mechs.romans[id];
      let bs = state.romans.get(String(id));
      if (!bs) {
        bs = new BodyState();
        state.romans.set(String(id), bs);
      }
      const pos = r.bar.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(r.bar.GetAngle() * 1000) / 1000;
    }
    // ---- 灯光神庙七面（0.3.45）----
    for (let id = 0; id < mechs.beamers.length; id++) {
      const b = mechs.beamers[id];
      let bs = state.beamers.get(String(id));
      if (!bs) {
        bs = new BeamState();
        state.beamers.set(String(id), bs);
      }
      bs.state = b.state;
      const pts = b.packed();
      if (bs.pts !== pts) bs.pts = pts;
    }
    const syncB = (map, key, body, angleSign, stateV) => {
      let bs = map.get(key);
      if (!bs) {
        bs = new BodyState();
        map.set(key, bs);
      }
      const pos = body.GetPosition();
      bs.x = Math.round(m2px(pos.x) * 10) / 10;
      bs.y = Math.round(m2px(pos.y) * 10) / 10;
      bs.angle = Math.round(angleSign * body.GetAngle() * 1000) / 1000;
      if (stateV !== undefined) bs.state = stateV;
    };
    for (let id = 0; id < mechs.rotMirrors.length; id++) syncB(state.rotMirrors, String(id), mechs.rotMirrors[id].body, 1, mechs.rotMirrors[id].state);
    for (let id = 0; id < mechs.boxMirrors.length; id++) syncB(state.boxMirrors, String(id), mechs.boxMirrors[id].body, 1);
    for (let id = 0; id < mechs.infiniteMirrors.length; id++) syncB(state.infiniteMirrors, String(id), mechs.infiniteMirrors[id].body, 1);
    for (let id = 0; id < mechs.lightPushers.length; id++) {
      const m = mechs.lightPushers[id];
      let ps = state.lightPushers.get(String(id));
      if (!ps) {
        ps = new PusherState();
        state.lightPushers.set(String(id), ps);
      }
      ps.group = m.group;
      ps.state = m.state;
      const pos = m.body.GetPosition();
      ps.x = Math.round(m2px(pos.x) * 10) / 10;
      ps.y = Math.round(m2px(pos.y) * 10) / 10;
    }
    for (let id = 0; id < mechs.sliders.length; id++) syncB(state.sliders, String(id), mechs.sliders[id].body, 1);
    const liquidsFlag = world.liquids.map((l) => (l.frozen ? "1" : "0")).join("");
    if (state.liquids !== liquidsFlag) state.liquids = liquidsFlag;
  };
  sync();
  return { state, sync };
}

function syncEncode(id, ticks = 600) {
  const w = new World(loadLevel(id).level);
  for (let i = 0; i < WARMUP; i++) w.step(1 / 60, stepInputs());
  const { state, sync } = buildState(w);
  const enc = new Encoder(state);
  enc.encodeAll(state);
  enc.discardChanges();
  const patchBytes = [];
  const syncMs = [];
  const encMs = [];
  for (let i = 0; i < ticks; i++) {
    w.step(1 / 60, stepInputs());
    let t = performance.now();
    sync();
    syncMs.push(performance.now() - t);
    t = performance.now();
    const buf = enc.encode();
    encMs.push(performance.now() - t);
    patchBytes.push(buf ? buf.length : 0);
    enc.discardChanges();
  }
  const s1 = stats(syncMs);
  const s2 = stats(encMs);
  const byteStats = stats(patchBytes);
  return {
    id,
    syncAvgMs: +s1.avg.toFixed(4),
    syncP95Ms: +s1.p95.toFixed(4),
    encAvgMs: +s2.avg.toFixed(4),
    encP95Ms: +s2.p95.toFixed(4),
    patchAvgB: +byteStats.avg.toFixed(1),
    patchP95B: byteStats.p95,
    patchMaxB: byteStats.max,
  };
}

// ---------------- 主流程 ----------------
const gitShort = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
const allIds = listLevelIds().sort();
const lightIds = allIds.filter((id) => id.startsWith("light"));
const forestSample = allIds.filter((id) => id.startsWith("forest")).filter((_, i) => i % 4 === 0); // 12 关抽样

log(`A 步进：light ${lightIds.length} 关 × ${STEPS} 步 + forest 抽样 ${forestSample.length} 关`);
const lightRows = stepSuite(lightIds);
const forestRows = stepSuite(forestSample);
const med = (arr, k) => {
  const v = arr.map((r) => r[k]).sort((a, b) => a - b);
  return +v[Math.floor(v.length / 2)].toFixed(4);
};
const lightMed = med(lightRows, "stepAvgMs");
const forestMed = med(forestRows, "stepAvgMs");
log(`light 中位 ${lightMed}ms vs forest 抽样中位 ${forestMed}ms（溢价 ${(((lightMed - forestMed) / forestMed) * 100).toFixed(1)}%）`);

log("B 分配率：beam 重关 top3");
const beamHeavy = [...lightRows].sort((a, b) => b.stepAvgMs - a.stepAvgMs).slice(0, 3).map((r) => r.id);
const allocRows = beamHeavy.map(allocRate);

log("C 同步+encode：light_02（beamer 持续）vs forest_01");
const syncRows = [syncEncode("light_02"), syncEncode("forest_01")];
for (const r of syncRows) log(`${r.id}: sync ${r.syncAvgMs}ms enc ${r.encAvgMs}ms patch ${r.patchAvgB}B(p95 ${r.patchP95B})`);

const report = {
  meta: { label: argSave ?? "adhoc", git: gitShort, date: new Date().toISOString(), steps: STEPS, gc: CAN_GC, scripted: SCRIPTED },
  stepLight: lightRows,
  stepForestSample: forestRows,
  summary: { lightMedStepMs: lightMed, forestSampleMedStepMs: forestMed, premiumPct: +(((lightMed - forestMed) / forestMed) * 100).toFixed(1) },
  allocBeamHeavy: allocRows,
  syncEncode: syncRows,
};

if (argSave) {
  const out = join(RESULTS, `perf-light-${argSave}.json`);
  writeFileSync(out, JSON.stringify(report, null, 1));
  log("已存档 →", out);
}
if (argCompare) {
  const f = join(RESULTS, `perf-light-${argCompare}.json`);
  if (!existsSync(f)) {
    console.error(`[light] 快照不存在: ${f}`);
    process.exitCode = 1;
  } else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    const row = (label, now, ref) => `  ${label}: ${ref} → ${now}（${(((now - ref) / ref) * 100).toFixed(1)}%）`;
    console.log(`\n=== 对比 ${argCompare}（git ${base.meta.git} → ${gitShort}）===`);
    console.log(row("light 中位步进", lightMed, base.summary.lightMedStepMs));
    for (const r of syncRows) {
      const ref = base.syncEncode.find((x) => x.id === r.id);
      if (ref) {
        console.log(row(`${r.id} sync`, r.syncAvgMs, ref.syncAvgMs));
        console.log(row(`${r.id} encode`, r.encAvgMs, ref.encAvgMs));
        console.log(row(`${r.id} patch B`, r.patchAvgB, ref.patchAvgB));
      }
    }
    for (const r of allocRows) {
      const ref = base.allocBeamHeavy.find((x) => x.id === r.id);
      if (ref) console.log(row(`${r.id} heap/600步 KB`, r.heapGrowthKBPer600, ref.heapGrowthKBPer600));
    }
  }
}

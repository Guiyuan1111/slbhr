// probe8c: r8c 槽 S5 定稿门续攻取证台（dbg29/board.mjs 谱系，TEMP/autoplay8c 专用，收尾清理）
// 模式:
//   node probe8c.mjs gate [recipe.json]     全程序=S4终稿+配方，±1f 穷举 f>=1367（finalize/exhaustiveSample 同口径）
//   node probe8c.mjs trace <side> <idx> <dir> [F0 F1]   指定事件 ±dir 平移，双轨逐帧对照
//   node probe8c.mjs cliff                  wg 西行越断崖扫描（fb 改泊 905 防挡路）
//   node probe8c.mjs phase                  ride 起始相位 sleep(k) k=0..9 → jd40 出射/落点/终态 定量表
// recipe.json 形如 {"fb":[["sleep",200],["walkTo",-1,700,999]],"wg":[["walkTo",-1,1070,999],...]}
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) { for (let d = dir; ; d = dirname(d)) { try { readFileSync(join(d, "package.json")); return d; } catch {} } }
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const kernel = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const botcore = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "botcore.mjs")).href);
const { makeWorld, expandFlat } = kernel;
const { NONE, drive, S, S2 } = botcore;

// ---- S4 定稿（full15a，累积程序，end@1370）与 v24 S5 配方（autosearch.mjs SEG.S5.recipe 同源）
const F15 = JSON.parse(readFileSync(join(ROOT, "note/research/2026-10-autoplay/tools/full15a.search.json"), "utf8"));
const s4f = F15.segs.find((s) => s.id === "S4").final;
const BASE_FB = s4f.sf, BASE_WG = s4f.sw;
const ENTRY_F = 1367, HORIZON_F = 800, PREFIX_END = 1370;
// v24（当前 autosearch.mjs S5 recipe）
const V24 = {
  fb: [["sleep", 200], ["walkTo", -1, 700, 999]],
  wg: [["walkTo", -1, 1070, 999], ["waitPlat", 0, 494, 498], ["jumpDrift", 1, 0, 20], ["walkTo", 1, 1160, 999],
    ["ride", 0, 396, 412], ["jumpDrift", -1, 0, 40], ["sleep", 20], ["goTo", 790, 25]],
};

// ---- 原语编译（dbg29 谱系；spec 兼容 {n,a} 与 [n,...a]）
const ds2 = (d) => (d > 0 ? "right" : "left");
const DIRS = new Set(["runJump", "jumpOnto", "jumpDrift", "brakedHop", "edgeDrop"]);
function stepOf(sp0) {
  const sp = Array.isArray(sp0) ? sp0 : [sp0.n, ...sp0.a];
  const [n, ...a] = sp;
  if (n === "hold") {
    const d = ds2(a[0]), xLine = a[1];
    return { name: `hold${d}${xLine}`, run: () => ({ ...NONE, [d]: true }), done: (c) => (d === "right" ? c.me.x >= xLine : c.me.x <= xLine) };
  }
  if (n === "ride") {
    let t = 0;
    return { name: `ride${a[0]}`, run: () => { t++; return t % 16 < 10 ? { ...NONE, right: true } : { ...NONE, left: true }; }, done: (c) => { const y = c.w.mechSnapshot().platforms[a[0]]?.y; return y !== undefined && y >= a[1] && y <= a[2]; } };
  }
  if (n === "waitPx") return { name: `wPx${a[0]}${a[1]}-${a[2]}`, run: () => NONE, done: (c) => c.other.x >= a[1] && c.other.x <= a[2] };
  if (n === "walkTo") {
    const D = ds2(a[0]), O = a[0] > 0 ? "left" : "right";
    return { name: `walk${a[0]}${a[1]}`, run: (c) => { const past = a[0] > 0 ? c.me.x >= a[1] : c.me.x <= a[1]; if (!past) return Math.abs(c.me.vx) > a[2] ? NONE : { ...NONE, [D]: true }; return Math.abs(c.me.vx) > 20 ? { ...NONE, [O] : true } : NONE; }, done: (c) => (a[0] > 0 ? c.me.x >= a[1] : c.me.x <= a[1]) && Math.abs(c.me.vx) <= 20 && c.me.grounded };
  }
  if (n === "waitPlat") return { name: `wPl${a[0]}`, run: () => NONE, done: (c) => { const y = c.w.mechSnapshot().platforms[a[0]]?.y; return y !== undefined && y >= a[1] && y <= a[2]; } };
  const args = DIRS.has(n) ? [ds2(a[0]), ...a.slice(1, n === "runJump" && a.length > 2 ? -1 : undefined)] : a;
  const stp = (["brakedHop", "edgeDrop"].includes(n) ? S2 : S)[n](...args);
  if (n === "runJump") {
    const holdF = a.length > 2 ? a[2] : 6;
    const orig = stp.run.bind(stp);
    let jumpedAt = -1, airAfter = false;
    stp.run = (ctx) => {
      if (ctx.f <= 1) return NONE;
      const inp = orig(ctx);
      if (inp.up) jumpedAt = ctx.f;
      else if (jumpedAt >= 0 && ctx.f <= jumpedAt + holdF - 1) inp.up = true;
      if (jumpedAt >= 0 && !ctx.me.grounded) airAfter = true;
      return inp;
    };
    stp.done = (c) => jumpedAt >= 0 && airAfter && c.me.grounded;
  }
  return stp;
}
const compile = (specLists) => ({ fb: specLists.fb.map(stepOf), wg: specLists.wg.map(stepOf) });

// ---- S5 断言组（checkpoints-forest_01.json S5.target 同口径）
const S5_TARGET = (a, b, gA, gB) =>
  a.x >= 550 && a.x <= 760 && a.y >= 245 && a.y <= 265 && gA &&
  b.x >= 750 && b.x <= 900 && b.y >= 245 && b.y <= 265 && gB;

function replay(T, deadline = ENTRY_F + HORIZON_F, onFrame = null) {
  const w = makeWorld("forest_01");
  const ins = expandFlat(T.fb, T.wg, deadline + 2);
  let met = false, Sx = null;
  for (let f = 0; f <= deadline; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (onFrame) onFrame(f, a, b, w, ins);
    if (a.dead || a.dying || b.dead || b.dying) return { ok: false, why: `die@${f} fb[${a.x.toFixed(0)},${a.y.toFixed(0)}] wg[${b.x.toFixed(0)},${b.y.toFixed(0)}]`, w };
    Sx = { a, b, gA: w.players.fireboy.feetContacts.length > 0, gB: w.players.watergirl.feetContacts.length > 0 };
    if (S5_TARGET(a, b, Sx.gA, Sx.gB)) { met = true; return { ok: true, why: `met@${f}`, w, metF: f }; }
  }
  return { ok: false, why: `no-met fb[${Sx.a.x.toFixed(0)},${Sx.a.y.toFixed(0)}] wg[${Sx.b.x.toFixed(0)},${Sx.b.y.toFixed(0)},${Sx.gB ? "g" : "a"}]`, w };
}

function buildRecipe(argRecipePath) {
  if (!argRecipePath) return JSON.parse(JSON.stringify(V24));
  return JSON.parse(readFileSync(argRecipePath, "utf8"));
}

// ---------------------------------------------------------------- gate
function gate(recipePath) {
  const rec = buildRecipe(recipePath);
  const prog = compile({ fb: [...BASE_FB, ...rec.fb], wg: [...BASE_WG, ...rec.wg] });
  const totalFrames = 2400;
  const dr = drive(makeWorld("forest_01"), prog, totalFrames);
  const T0 = { fb: dr.events.fb.map((e) => ({ ...e })), wg: dr.events.wg.map((e) => ({ ...e })) };
  const base = replay(T0);
  const lastA = dr.result.deathF >= 0 ? `die@${dr.result.deathF}` : "alive";
  console.log(`base: ${base.why} (drive ${lastA}, events fb${T0.fb.length}/wg${T0.wg.length}, S5新增 wg idx>=${T0.wg.findIndex((e) => e.f >= ENTRY_F)})`);
  if (base.ok !== true) { console.log("GATE FAIL: base 未达标，配方不可用"); process.exit(1); }
  const jobs = [];
  for (const side of ["fb", "wg"]) T0[side].forEach((e, i) => { if (e.f >= ENTRY_F) jobs.push({ side, i, f: e.f }); });
  let fails = 0;
  for (const ev of jobs) {
    for (const dir of [-1, 1]) {
      const T = { fb: T0.fb.map((e) => ({ ...e })), wg: T0.wg.map((e) => ({ ...e })) };
      T[ev.side][ev.i].f += dir;
      const r = replay(T);
      if (!r.ok) { fails++; console.log(`FATAL ${ev.side}[${ev.i}] base_f=${ev.f} ${dir > 0 ? "+1" : "-1"} → ${r.why} ev=${JSON.stringify(T0[ev.side][ev.i])}`); }
    }
  }
  console.log(`swept ${jobs.length} events ×2 = ${jobs.length * 2}, fails=${fails} → GATE ${fails === 0 ? "PASS" : "FAIL"}`);
  process.exit(fails === 0 ? 0 : 1);
}

// ---------------------------------------------------------------- trace
function trace(side, idx, dir, F0 = 1360, F1 = 2260) {
  const rec = buildRecipe(undefined);
  const prog = compile({ fb: [...BASE_FB, ...rec.fb], wg: [...BASE_WG, ...rec.wg] });
  const dr = drive(makeWorld("forest_01"), prog, 2400);
  const T0 = { fb: dr.events.fb.map((e) => ({ ...e })), wg: dr.events.wg.map((e) => ({ ...e })) };
  const T = { fb: T0.fb.map((e) => ({ ...e })), wg: T0.wg.map((e) => ({ ...e })) };
  T[side][idx].f += dir;
  console.log(`shift ${side}[${idx}] ${dir > 0 ? "+1" : "-1"}: ${JSON.stringify(T0[side][idx])}`);
  console.log("wg events f>=1350:", JSON.stringify(T0.wg.filter((e) => e.f >= 1350)));
  const cap = (Tt, tag) => {
    const rows = [];
    const r = replay(Tt, ENTRY_F + HORIZON_F, (f, a, b, w, ins) => {
      if (f >= F0 && f <= F1 && f % 2 === 0) rows.push(`f${f} wg[${b.x.toFixed(1)},${b.y.toFixed(1)},v${b.vx.toFixed(0)},${w.players.watergirl.feetContacts.length > 0 ? "g" : "a"}] P0y=${w.mechSnapshot().platforms[0]?.y.toFixed(1)} in=${ins.wg[f].left ? "L" : "."}${ins.wg[f].right ? "R" : "."}${ins.wg[f].up ? "U" : "."}`);
    });
    console.log(`== ${tag}: ${r.why}`);
    console.log(rows.join("\n"));
  };
  cap(T0, "base");
  cap(T, "shift");
  process.exit(0);
}

// ---------------------------------------------------------------- cliff（fb 改泊 905 防挡）
function cliff() {
  const rec = {
    fb: [["sleep", 200], ["walkTo", -1, 905, 999]],
    wg: [...V24.wg.slice(0, -1), ["walkTo", -1, 600, 999]],
  };
  const prog = compile({ fb: [...BASE_FB, ...rec.fb], wg: [...BASE_WG, ...rec.wg] });
  let prev = null, edge = null;
  const w2 = makeWorld("forest_01");
  const dr = drive(w2, prog, 2600);
  const T0 = dr.events;
  const w3 = makeWorld("forest_01");
  const ins = expandFlat(T0.fb, T0.wg, 2602);
  let log = [];
  for (let f = 0; f <= 2600; f++) {
    w3.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w3.snapshotPlayer("fireboy"), b = w3.snapshotPlayer("watergirl");
    if (a.dead || a.dying || b.dead || b.dying) { log.push(`die@${f} fb[${a.x.toFixed(0)},${a.y.toFixed(0)}] wg[${b.x.toFixed(0)},${b.y.toFixed(0)}]`); break; }
    if (b.x < 1050 && prev) {
      if (prev.y < 300 && b.y > 400) { edge = { f, xPrev: prev.x, xNow: b.x, yPrev: prev.y, yNow: b.y }; log.push(`CLIFF cross@f${f}: wg x ${prev.x.toFixed(1)}→${b.x.toFixed(1)} y ${prev.y.toFixed(1)}→${b.y.toFixed(1)} (缘 x≈${edge.xPrev.toFixed(1)})`); }
      if (f % 10 === 0 && b.x < 800 && b.x > 600) log.push(`f${f} wg[${b.x.toFixed(1)},${b.y.toFixed(1)},v${b.vx.toFixed(0)}] fb[${a.x.toFixed(0)},${a.y.toFixed(0)}]`);
    }
    prev = { x: b.x, y: b.y };
  }
  console.log(log.join("\n"));
  console.log(`cliff edge x ≈ ${edge ? edge.xPrev.toFixed(1) + "（西缘，越线即坠 477）" : "未检出（wg 未坠？）"}`);
  process.exit(0);
}

// ---------------------------------------------------------------- phase（ride 相位 → 净漂移定量，10 采样）
function phase() {
  console.log("k  rideDoneF jd40启动(f,x,vx)      落坡(f,x,y)          终态wg            met");
  for (let k = 0; k <= 9; k++) {
    const rec = { fb: V24.fb, wg: [...V24.wg.slice(0, 4), ["sleep", k], ...V24.wg.slice(4)] };
    const prog = compile({ fb: [...BASE_FB, ...rec.fb], wg: [...BASE_WG, ...rec.wg] });
    let rideDoneF = -1, launch = null, land = null, prevG = true, prevUp = false, prev = null;
    const w = makeWorld("forest_01");
    const dr = drive(w, prog, 2400);
    const T0 = dr.events;
    const r = replay(T0, ENTRY_F + HORIZON_F, (f, a, b, ww, ins) => {
      const py = ww.mechSnapshot().platforms[0]?.y;
      if (rideDoneF < 0 && py !== undefined && py >= 396 && py <= 412) rideDoneF = f;
      if (prevUp && ins.wg[f].up && f > 1600 && !launch) launch = { f, x: b.x, vx: b.vx, y: b.y, py };
      if (!prevUp && ins.wg[f].up) void 0;
      prevUp = ins.wg[f].up;
      const g = ww.players.watergirl.feetContacts.length > 0;
      if (launch && !land && prev && !prevG && g && b.y < 420) land = { f, x: b.x, y: b.y };
      prevG = g; prev = { x: b.x, y: b.y };
    });
    const endB = r.w ? r.w.snapshotPlayer("watergirl") : null;
    console.log(`${k}  ${String(rideDoneF).padStart(4)}      ${launch ? `f${launch.f} x${launch.x.toFixed(1)} v${launch.vx.toFixed(0)} py${launch.py.toFixed(0)}` : "-"}  ${land ? `f${land.f} x${land.x.toFixed(1)} y${land.y.toFixed(1)}` : "-"}  [${endB ? `${endB.x.toFixed(0)},${endB.y.toFixed(0)}` : "-"}]  ${r.ok ? r.why : r.why}`);
  }
  process.exit(0);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "gate") gate(rest[0]);
else if (mode === "trace") trace(rest[0], Number(rest[1]), Number(rest[2]), Number(rest[3] ?? 1360), Number(rest[4] ?? 2260));
else if (mode === "cliff") cliff();
else if (mode === "phase") phase();
else { console.log("modes: gate [recipe.json] | trace side idx dir [F0 F1] | cliff | phase"); process.exit(2); }

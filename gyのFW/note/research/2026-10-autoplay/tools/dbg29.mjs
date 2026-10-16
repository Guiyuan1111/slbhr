// dbg27: S2 事件表 ±1f 穷举定位（S1 解种子 + S2 配方；autosearch exhaustiveSample 同口径）
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) { for (let d = dir; ; d = dirname(d)) { try { readFileSync(join(d, "package.json")); return d; } catch {} } }
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const kernel = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const botcore = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "botcore.mjs")).href);
const { makeWorld, expandFlat } = kernel;
const { NONE, drive, S, S2 } = botcore;
const R = JSON.parse(readFileSync(join(ROOT, "note/research/2026-10-autoplay/tools", process.env.RPT ?? "full7b.search.json"), "utf8"));
const s1 = [...R.segs].reverse().find((s) => s.final).final;
const ds2 = (d) => (d > 0 ? "right" : "left");
const DIRS = new Set(["runJump", "jumpOnto", "jumpDrift", "brakedHop", "edgeDrop"]);
const stepOf = (sp0) => {
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
    return { name: `walk${a[0]}${a[1]}`, run: (c) => { const past = a[0] > 0 ? c.me.x >= a[1] : c.me.x <= a[1]; if (!past) return Math.abs(c.me.vx) > a[2] ? NONE : { ...NONE, [D]: true }; return Math.abs(c.me.vx) > 20 ? { ...NONE, [O]: true } : NONE; }, done: (c) => (a[0] > 0 ? c.me.x >= a[1] : c.me.x <= a[1]) && Math.abs(c.me.vx) <= 20 && c.me.grounded };
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
};
const extraF = JSON.parse(process.argv[3] ?? '[["jumpDrift",1,0,90],["goTo",220,10],["sleep",15]]');
const extraW = JSON.parse(process.argv[4] ?? '[["jumpOnto",-1,570],["goTo",60,10],["sleep",15]]');
const prog = {
  fb: s1.sf.map((p) => stepOf(p)).concat(extraF.map(stepOf)),
  wg: s1.sw.map((p) => stepOf(p)).concat(extraW.map(stepOf)),
};
const MINF = Number(process.argv[2] ?? 979);
const DEADLINE = 1600;
const TGT = process.env.TGT ?? "s3";
const inTarget = (a, b, py, gA, gB, M) =>
  TGT === "s4"
    ? a.x >= 955 && a.x <= 1012 && a.y >= 306 && a.y <= 326 && gA && M.pushers?.[0]?.state === 1 &&
      b.x >= 1030 && b.x <= 1120 && b.y >= 466 && b.y <= 492 && gB
    : a.x >= 1000 && a.x <= 1120 && a.y >= 466 && a.y <= 492 && gA &&
      b.x >= 336 && b.x <= 368 && b.y >= 430 && b.y <= 458 && gB &&
      M.pushers?.[1]?.state === 1;
function replay(T) {
  const w = makeWorld("forest_01");
  const ins = expandFlat(T.fb, T.wg, DEADLINE + 4);
  let lastA, lastB, lastG;
  for (let f = 0; f <= DEADLINE; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    lastA = a; lastB = b; lastG = [w.players.fireboy.feetContacts.length > 0, w.players.watergirl.feetContacts.length > 0];
    if (a.dead || a.dying || b.dead || b.dying) return { ok: false, why: `die@${f}` };
    if (inTarget(a, b, 0, lastG[0], lastG[1], w.mechSnapshot())) return { ok: true, why: `met@${f}` };
  }
  return { ok: false, why: `no-met fb[${lastA.x.toFixed(0)},${lastA.y.toFixed(0)},${lastG[0]?"g":"a"}] wg[${lastB.x.toFixed(0)},${lastB.y.toFixed(0)},${lastG[1]?"g":"a"}] P1=${(w.mechSnapshot().platforms[1]?.y??-1).toFixed(0)}` };
}
const dr = drive(makeWorld("forest_01"), prog, DEADLINE, {});
console.log("baseline deathF=", dr.result.deathF, "won=", dr.result.won, JSON.stringify(replay(dr.events)));
if (process.argv[5] === "seam") {
  // S4-entry seam 复现（seamOkNr 同口径）：entry 首帧 / 双侧排干帧 / 移动中入窗 / 末态 allS
  const inEntry = (a, b, gA, gB) => a.x >= 1000 && a.x <= 1120 && a.y >= 466 && a.y <= 492 && gA && b.x >= 336 && b.x <= 368 && b.y >= 430 && b.y <= 458 && gB;
  const w = makeWorld("forest_01");
  const ins = expandFlat(dr.events.fb, dr.events.wg, 1604);
  let entryF = -1, eS = null, drainFb = -1, drainWg = -1;
  for (let f = 0; f <= 1400; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    const gA = w.players.fireboy.feetContacts.length > 0, gB = w.players.watergirl.feetContacts.length > 0;
    if (f < 1160 && ins.fb[f].left) void 0;
    if (drainFb < 0 && f >= 1100 && !ins.fb.slice(0).length) void 0;
    if (entryF < 0 && inEntry(a, b, gA, gB)) { entryF = f; eS = { a: [a.x, a.y, a.vx], b: [b.x, b.y, b.vx] }; }
    if (f === 1300 || f === 1310 || f === 1320) console.log(`f${f} fb[${a.x.toFixed(1)},${a.y.toFixed(1)},v${a.vx.toFixed(0)},${gA?"g":"a"}] wg[${b.x.toFixed(1)},${b.y.toFixed(1)},v${b.vx.toFixed(0)},${gB?"g":"a"}] entry=${entryF >= 0 ? "y@" + entryF : "n"}`);
  }
  console.log("entryF=", entryF, "entryState=", JSON.stringify(eS), "ends1400=", JSON.stringify((() => { const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl"); return [a.x, b.x]; })()));
  process.exit(0);
}
if (process.argv[5] === "trace") {
  const shIdx = Number(process.argv[6] ?? 104), shD = Number(process.argv[7] ?? -1);
  const T = { fb: dr.events.fb.map((e) => ({ ...e })), wg: dr.events.wg.map((e) => ({ ...e })) };
  T.wg[shIdx].f += shD;
  console.log("wg events f>=1000:", JSON.stringify(dr.events.wg.filter((e) => e.f >= 1000)));
  for (const [tag, TT] of [["base", { fb: dr.events.fb.map((e) => ({ ...e })), wg: dr.events.wg.map((e) => ({ ...e })) }], ["shift", T]]) {
    const w = makeWorld("forest_01");
    const ins = expandFlat(TT.fb, TT.wg, 1604);
    let line = "";
    for (let f = 0; f < 1040; f++) w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    for (let f = 1040; f <= 1260; f++) {
      w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
      const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
      const i = ins.wg[f];
      if (f % 4 === 0) line += `\nf${f} wg[${b.x.toFixed(1)},${b.y.toFixed(1)},v${b.vx.toFixed(0)}] in=${i.left ? "L" : "."}${i.right ? "R" : "."}${i.up ? "U" : "."}`;
    }
    console.log(tag, line);
  }
  process.exit(0);
}
const jobs = [];
for (const side of ["fb", "wg"]) dr.events[side].forEach((e, i) => { if (e.f >= MINF) jobs.push({ side, i, f: e.f }); });
let fails = 0;
for (const ev of jobs) {
  for (const dir of [-1, 1]) {
    const T = { fb: dr.events.fb.map((e) => ({ ...e })), wg: dr.events.wg.map((e) => ({ ...e })) };
    T[ev.side][ev.i].f += dir;
    const r = replay(T);
    if (!r.ok) { fails++; console.log(`FATAL ${ev.side}[${ev.i}] base_f=${ev.f} ${dir > 0 ? "+1" : "-1"} → ${r.why} ev=${JSON.stringify(dr.events[ev.side][ev.i])}`); }
  }
}
console.log(`swept ${jobs.length} events ×2 = ${jobs.length * 2}, fails=${fails}`);

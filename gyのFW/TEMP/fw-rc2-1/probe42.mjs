// probe42（fw-route-crystal2 槽）：C5 尾部重建 v2 — stack 顶越塔直入门带（免传送）
// 依据：v23/24 塔跳自死台(566,feet211) apex feet106 距塔顶96 差10px；stack 顶 x[544,576]
// top192 起跳（apex 192-128=64 < 96 余量32px）→ 漂移西越 tower-2 → 落基座顶224/主地板
// 256 西段 → fb 门带[416,480] / wg 门带[64,128] 全在西段 → 全程无需南带 TP（mini-final
// 11 的 TP 通道保留为备选证据）。wg 上行依赖 v25 WGSX 拼接（井弧再入 P3→TP P2→西行）。
// MODE=scanW(wg HP 扫描) / scanF(fb HP 扫描) / final / dump
import { writeFileSync } from "node:fs";
import { makeWorld } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs";
import { NONE, S } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/botcore.mjs";

const ds = (d) => (d > 0 ? "right" : "left");
const wrapTap = (stp) => { const orig = stp.run.bind(stp); let jAt = -1, airAfter = false;
  stp.run = (ctx) => { if (ctx.f <= 1) return NONE;
    const inp = orig(ctx) || NONE;
    if (inp.up) { jAt = ctx.f; }
    else if (jAt >= 0 && ctx.f <= jAt + UPW - 1) { inp.up = true; }
    if (jAt >= 0 && !ctx.me.grounded) airAfter = true;
    return inp; };
  stp.done = (c) => jAt >= 0 && airAfter && c.me.grounded && c.me.vy >= -8;
  return stp; };
const UPW = 25;
const PRIM = {
  sleep: (...a) => S.sleep(...a),
  goTo: (...a) => S.goTo(...a),
  hold: (d, xLine) => S.hold(ds(d), (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine)),
  jumpDrift: (d, ...a) => wrapTap(S.jumpDrift(ds(d), ...a)),
  jumpOnto: (d, aboveY) => wrapTap(S.jumpOnto(ds(d), aboveY)),
  walkTo: (d, xLine, vMax = 70) => {
    const D = ds(d), O = d > 0 ? "left" : "right";
    return {
      name: `walk${d}${xLine}`,
      run: (c) => {
        const past = d > 0 ? c.me.x >= xLine : c.me.x <= xLine;
        if (!past) return Math.abs(c.me.vx) > vMax ? NONE : { ...NONE, [D]: true };
        return Math.abs(c.me.vx) > 20 ? { ...NONE, [O]: true } : NONE;
      },
      done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) && Math.abs(c.me.vx) <= 20 && c.me.grounded,
    };
  },
  // mini-final 实证 jd 语义：仅 f0 一帧 up，f1..holdF 持方向，其余 NONE，固定 totalF 帧后 done
  jd1f: (d, holdF, totalF) => ({ name: `jd1f${d}`,
    run: (c) => { const st = c.mem; const t = (st.t = (st.t ?? -1) + 1);
      const D = d > 0 ? "right" : "left";
      if (t === 0) return { ...NONE, up: true, [D]: true };
      if (t <= holdF) return { ...NONE, [D]: true };
      return NONE; },
    done: (c) => (c.mem.t ?? 0) >= totalF }),
  runJump: (d, ...a) => {
    const holdF = a.length > 1 ? a[a.length - 1] : 6;
    const stp = S.runJump(ds(d), a[0]);
    const orig = stp.run.bind(stp);
    let jumpedAt = -1, airAfter = false;
    stp.run = (ctx) => {
      if (ctx.f <= 1) return NONE;
      const inp = orig(ctx);
      if (inp.up) jumpedAt = ctx.f;
      else if (jumpedAt >= 0 && ctx.f <= jumpedAt + holdF - 1) { inp.up = true; }
      if (jumpedAt >= 0 && !ctx.me.grounded) airAfter = true;
      return inp;
    };
    stp.done = (c) => jumpedAt >= 0 && airAfter && c.me.grounded;
    return stp;
  },
};

const MODE = process.env.MODE || "final";
const NW = Number(process.env.NW ?? 2);
const NF = Number(process.env.NF ?? 9);
const WGWAIT = Number(process.env.WGWAIT ?? 1300);
const HP = Number(process.env.HP ?? 0);
const HT = Number(process.env.HT ?? 30);

const jd40 = spec("jumpDrift", -1, 0, 40);
function spec(n, ...a) { return { n, a }; }
const stepOf = (sp) => PRIM[sp.n](...sp.a);

const PROG = {
  wg: [
    spec("sleep", 3), jd40, jd40, jd40, jd40, jd40, jd40, jd40, spec("sleep", 40),   // C0
    spec("hold", -1, 500), spec("sleep", 15),                                         // C1
    spec("hold", 1, 565), spec("sleep", 20),                                          // C2
    spec("hold", 1, 575), spec("runJump", -1, 535, 25), spec("hold", -1, 300), jd40, jd40, jd40, spec("jumpDrift", -1, 0, 55), spec("sleep", 40), // C3 = probe16d wg 原文
    spec("sleep", 200),                          // 错峰
    spec("sleep", WGWAIT),                       // 等 fb 完成 C3（井弧单人化防互扰，v25 实证）
    spec("walkTo", 1, 190, 60),                  // v25 WGSX 拼接原文：东整备
    spec("walkTo", -1, 70, 60),                  // 西回井口
    spec("jumpOnto", -1, 700),                   // 井弧再入 P3 → TP P2(1216,112)
    spec("walkTo", -1, 620, 60),                 // 西行 row-4 唇口 640 → 唇落主地板 (v25 fb 同路)
    spec("walkTo", -1, 568, 60),                 // 西行爬台阶(256→224→192)上 stack 顶
    spec("sleep", 20),
    spec("jd1f", -1, HP, 60),                    // stack 顶(192) 西跳越 tower-2(顶96) → 主地板西段
    spec("sleep", 30),
    spec("walkTo", -1, 110, 60),                 // 西行入 wg 门带 [64,128] 驻留
    spec("sleep", 600),
  ],
  fb: [
    spec("sleep", 220),                                                          // 错峰（probe6e）
    spec("sleep", 3), jd40, jd40, jd40, jd40, jd40, jd40, jd40, spec("sleep", 40),   // C0
    spec("hold", -1, 420), spec("sleep", 15),                                    // C1
    spec("hold", 1, 488), spec("sleep", 40),                                     // C2
    spec("sleep", 120), jd40, spec("jumpDrift", -1, 0, 32), jd40, spec("jumpDrift", -1, 0, 55), spec("sleep", 40), // C3 = probe16d fb 原文
    spec("sleep", 30),
    spec("walkTo", -1, 620, 60),                 // 楼梯攀→高板→唇口蠕落→主地板 (v25 实证)
    spec("walkTo", -1, 568, 60),                 // 西行爬台阶(256→224→192)上 stack 顶 x[544,576]
    spec("sleep", 20),
    spec("jd1f", -1, HP, 60),                    // stack 顶(192) 西跳越 tower-2(x[512,544] 顶96) → 主地板西段
    spec("sleep", 30),
    spec("walkTo", -1, 441, 60),                 // 西行（越 tower-2 基座顶 224→落主地板）入 fb 门带 [416,480]
    spec("sleep", 600),
  ],
};
const SEGBOUNDS = { fb: [9, 11, 13, 19, 25, 26], wg: [8, 10, 12, 20, 26, 31] };
const segTag = (role, i) => {
  const b = SEGBOUNDS[role];
  return i <= b[0] ? "C0" : i <= b[1] ? "C1" : i <= b[2] ? "C2" : i <= b[3] ? "C3" : i <= b[4] ? "C4" : "C5";
};

let progs = { fb: PROG.fb.map(stepOf), wg: PROG.wg.map(stepOf) };
if (MODE === "scanW") {
  // fb 走完 stack 跳后驻留（不进门带走步，避免扰动 wg 落点判定）
  const fbIdle = PROG.fb.slice(0, 26).map(stepOf);   // ..jd1f+sleep30
  fbIdle.push(stepOf({ n: "sleep", a: [60000] }));
  progs.fb = fbIdle;
}
if (MODE === "scanF") {
  // wg 停在 C3 末（lever floor 西），不参与
  const wgIdle = PROG.wg.slice(0, 21).map(stepOf);   // ..sleep40(C3 末)
  wgIdle.push(stepOf({ n: "sleep", a: [60000] }));
  progs.wg = wgIdle;
}
const TOTAL = Number(process.env.TOTAL ?? 14000);

const w = makeWorld("crystal_03");
const idx = { fb: 0, wg: 0 };
const state = { fb: { ...NONE }, wg: { ...NONE } };
const snapOf = (role) => {
  const s = w.snapshotPlayer(role);
  return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: w.players[role].feetContacts.length > 0, dead: s.dead || s.dying, atDoor: s.atDoor };
};
const prev = { fb: null, wg: null };
const dump = { fb: [], wg: [] };   // 逐帧输入记录（dump 模式）
let f = 0;
let progSum = 0, progAt = 0;
let wgTpAt = -1, fbTpAt = -1;
for (f = 0; f < TOTAL; f++) {
  const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
  for (const role of ["fb", "wg"]) {
    NONE.up = false; NONE.left = false; NONE.right = false;
    const stp = progs[role][idx[role]];
    if (!stp) continue;
    const ctx = { f, w, me: meS[role], other: meS[role === "fb" ? "wg" : "fb"], mem: (stp._mem ??= {}), jumpHeld: state[role].up };
    let inp = null;
    try { inp = stp.run(ctx); } catch { inp = NONE; }
    const next = { up: !!(inp?.up), left: !!(inp?.left), right: !!(inp?.right) };
    if (MODE === "dump") dump[role].push({ ...next });
    state[role] = next;
    let d = false;
    try { d = stp.done(ctx); } catch { d = false; }
    if (d) idx[role]++;
  }
  if (idx.fb + idx.wg !== progSum) { progSum = idx.fb + idx.wg; progAt = f; }
  if (f - progAt > 3000) { console.log("ABORT stuck-no-progress since f" + progAt); break; }
  w.step(1 / 60, { fireboy: state.fb, watergirl: state.wg });
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  const tp = [];
  const chk = (tag, cur, prv) => { if (prv && Math.hypot(cur.x - prv.x, cur.y - prv.y) > 80) { tp.push(`${tag}:${prv.x.toFixed(0)},${prv.y.toFixed(0)}→${cur.x.toFixed(0)},${cur.y.toFixed(0)}`); if (tag === "wg" && wgTpAt < 0) wgTpAt = f; if (tag === "fb" && fbTpAt < 0) fbTpAt = f; } };
  chk("fb", a, prev.fb); chk("wg", b, prev.wg);
  prev.fb = { x: a.x, y: a.y }; prev.wg = { x: b.x, y: b.y };
  const doors = w.doors;
  if (f % 100 === 0 || tp.length || a.dead || a.dying || b.dead || b.dying || w.phase === "won") {
    console.log(`f${String(f).padStart(5)} [fb${segTag("fb", idx.fb)}/${idx.fb} wg${segTag("wg", idx.wg)}/${idx.wg}] fb[${a.x.toFixed(0)},${a.y.toFixed(0)},g${w.players.fireboy.feetContacts.length > 0 ? 1 : 0},d${a.atDoor ? 1 : 0}] wg[${b.x.toFixed(0)},${b.y.toFixed(0)},g${w.players.watergirl.feetContacts.length > 0 ? 1 : 0},d${b.atDoor ? 1 : 0}] doorUp[${doors.fireboy.isUp ? 1 : 0},${doors.watergirl.isUp ? 1 : 0}]${tp.length ? " TP:" + tp.join(" | ") : ""}${a.dead || a.dying ? " FB-DEAD" : ""}${b.dead || b.dying ? " WG-DEAD" : ""}${w.phase === "won" ? " *** WON ***" : ""}`);
  }
  if (a.dead || a.dying || b.dead || b.dying || w.phase === "won") break;
}
console.log(`\nEND f=${f} idx fb=${idx.fb}/${progs.fb.length} wg=${idx.wg}/${progs.wg.length} won=${w.phase === "won"} wgTp=${wgTpAt} fbTp=${fbTpAt} NW=${NW} NF=${NF}`);

if (MODE === "dump" && w.phase === "won") {
  // 路线 JSON：逐帧布尔 → 边沿事件（down/up），与 expandFlat 逐帧布尔严格互逆
  const mk = (frames) => {
    const evs = [];
    const st = { up: false, left: false, right: false };
    for (let i = 0; i < frames.length; i++) {
      for (const k of ["up", "left", "right"]) {
        if (frames[i][k] && !st[k]) evs.push({ f: i, dir: k, type: "down" });
        if (!frames[i][k] && st[k]) evs.push({ f: i, dir: k, type: "up" });
        st[k] = frames[i][k];
      }
    }
    return evs;
  };
  const doc = { level: "crystal_03", tickHz: 60, totalFrames: f + 60, fb: mk(dump.fb), wg: mk(dump.wg) };
  writeFileSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-rc2-1/route-c3-cand.json", JSON.stringify(doc));
  console.log("route JSON written: route-c3-cand.json totalFrames=" + doc.totalFrames);
}

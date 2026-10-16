// r05g STEP1: 内核复测 o05a oracle 东缝跳配方（05号档 §3/§5）
// 前置：fb 侧 bot7 实证链 S1→西704台→杆2首翻（lever2 0→1）→ P3 tween 西→东（~2.4s）
//       → P3 驻东 [632.26,768.26]×[803.92,832.08]。
// 配方：wg 站位 x∈[785.5,793] → A 预压 pre∈{0,1,2}f → 满跳（W 持 2f，逐字复刻 oracle 时序；
//       内核跳跃=冲量+定速无可变截断，W 时长不影响高度，按 oracle 逐帧复刻保真）→
//       空中 A 保持 aHold∈{12,16,20}f 西漂 → 贴 P3 东面上行越缘(768.26)落顶。
// 命中判据（对齐 o05a §3）：落定 grounded && core y∈[758,780] && x∈(632,769)。
// 负对照：墙贴位（restX≈783.6）预期 B4 型 0 命中。
// 用法：cd gyのFW && node --import tsx ../TEMP/r05g/probe1-seam.mjs
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const NONE = { up: false, left: false, right: false };
const ms = (w) => w.mechSnapshot();
const p3x = (w) => ms(w).platforms[2].x;
const lev2On = (w) => ms(w).levers[1].state === 1;

// ---- bot7 S2p 原语（逐字移植 bot7-f05.mjs，帧级闭环）----
function runJumpS(w, role, dir, line, holdF, st) {
  const i = { ...NONE, [dir]: true };
  const s = w.snapshotPlayer(role);
  const grounded = w.players[role].feetContacts.length > 0;
  if (!st.jumped) {
    if (grounded && (dir === "right" ? s.x >= line : s.x <= line)) { i.up = true; st.jumped = true; st.t = 0; }
    return i;
  }
  st.t++;
  if (st.t > holdF) return NONE;
  return i;
}
function creepJumpS(w, role, dir, preRun, holdF, st) {
  const i = { ...NONE, [dir]: true };
  const s = w.snapshotPlayer(role);
  const grounded = w.players[role].feetContacts.length > 0;
  if (st.phase === 0) { if (grounded && Math.abs(s.vx) < 30) st.phase = 1; return NONE; }
  if (st.phase === 1) { if (++st.t >= preRun) { i.up = true; st.phase = 2; st.t = 0; st.jumped = true; } return i; }
  st.t++;
  if (st.t > holdF) return NONE;
  return i;
}
function doneLanded(w, role, st) {
  const s = w.snapshotPlayer(role);
  const grounded = w.players[role].feetContacts.length > 0;
  if (!grounded) st.air = true;
  return st.jumped && st.air && grounded && s.vy >= -8;
}

// ---- fb 前置链（bot7 实证）：S1→P3西→西704→杆2首翻→驻定 ----
function fbPrelude(w, log) {
  const st1 = {}, st2 = {}, stL = {};
  let phase = 0, f = 0, sleepT = 0;
  for (; f < 900; f++) {
    let inp = NONE;
    if (phase === 0) { // S1 地板→P3西
      inp = runJumpS(w, "fireboy", "right", 450, 30, st1);
      const s = w.snapshotPlayer("fireboy");
      if (st1.jumped && w.players.fireboy.feetContacts.length > 0 && s.y < 830 && s.x > 504) { phase = 1; log?.(`f${f} fb P3西落定 (${s.x.toFixed(1)},${s.y.toFixed(1)})`); }
    } else if (phase === 1) { // 走位
      const s = w.snapshotPlayer("fireboy");
      const d = 548 - s.x;
      inp = Math.abs(d) > 4 ? { ...NONE, [d > 0 ? "right" : "left"]: true } : NONE;
      if (Math.abs(d) <= 4 && Math.abs(s.vx) < 40 && w.players.fireboy.feetContacts.length > 0) { phase = 2; st2.phase = 0; st2.t = 0; log?.(`f${f} fb S2走位就绪 x=${s.x.toFixed(1)}`); }
    } else if (phase === 2) { // 西跳西704台
      inp = creepJumpS(w, "fireboy", "left", 7, 45, st2);
      const s = w.snapshotPlayer("fireboy");
      if (st2.jumped && w.players.fireboy.feetContacts.length > 0 && s.y < 745 && s.x < 500) { phase = 3; log?.(`f${f} fb 西704落定 (${s.x.toFixed(1)},${s.y.toFixed(1)})`); }
    } else if (phase === 3) { // 杆2首翻：持L穿杆
      inp = { ...NONE, left: true };
      const s = w.snapshotPlayer("fireboy");
      if (lev2On(w) && s.x <= 412) { phase = 4; sleepT = 0; log?.(`f${f} fb 杆2翻转确认 lev2On x=${s.x.toFixed(1)} P3x=${p3x(w).toFixed(1)}`); }
    } else if (phase === 4) { // 驻定
      inp = NONE;
      if (++sleepT >= 12) { phase = 5; log?.(`f${f} fb 前置链完成，P3 tween 中 P3x=${p3x(w).toFixed(1)}`); break; }
    }
    w.step(1 / 60, { fireboy: inp, watergirl: NONE });
  }
  return f;
}

// ---- wg 站位走（闭环：hold left 至 x≤θ，松键滑停 |vx|<2）----
function wgWalk(w, theta, maxF = 600) {
  let phase = 0;
  for (let f = 0; f < maxF; f++) {
    const s = w.snapshotPlayer("watergirl");
    const inp = phase === 0 ? { ...NONE, left: true } : NONE;
    if (phase === 0 && s.x <= theta) phase = 1;
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
    const s2 = w.snapshotPlayer("watergirl");
    if (phase === 1 && Math.abs(s2.vx) < 2 && Math.abs(s2.vy) < 2) return { f, x: s2.x, y: s2.y };
  }
  return { f: maxF, x: w.snapshotPlayer("watergirl").x, y: 0 };
}

// ---- 东缝跳（oracle p4-sweep 输入时序逐帧移植）----
// f0: A down；f=pre: W down；f=pre+2: W up；f=pre+2+aHold: A up；之后零输入观察。
function seamJump(w, pre, aHold, trace) {
  let minY = 999, takeoff = null, rest = null;
  const y0 = w.snapshotPlayer("watergirl").y;
  for (let f = 0; f < 240; f++) {
    const before = w.snapshotPlayer("watergirl");
    if (f === pre) takeoff = { x: +before.x.toFixed(2), y: +before.y.toFixed(2), vx: +before.vx.toFixed(1) };
    let inp = NONE;
    if (f === 0 || (f > 0 && f < pre + 2 + aHold)) inp = { ...NONE, left: true };
    if (f === pre) inp = { ...NONE, left: true, up: true };
    if (f === pre + 2) inp = { ...NONE, left: true };
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
    const s = w.snapshotPlayer("watergirl");
    if (s.y < minY) minY = s.y;
    trace?.push({ f, x: +s.x.toFixed(2), y: +s.y.toFixed(2), vx: +s.vx.toFixed(1), vy: +s.vy.toFixed(1) });
    if (f > 30 && w.players.watergirl.feetContacts.length > 0 && Math.abs(s.vx) < 2 && Math.abs(s.vy) < 8) { rest = s; break; }
  }
  if (!rest) rest = w.snapshotPlayer("watergirl");
  return {
    takeoff, y0: +y0.toFixed(2), minY: +minY.toFixed(2), rise: +(y0 - minY).toFixed(2),
    restX: +rest.x.toFixed(2), restY: +rest.y.toFixed(2),
    onTop: rest.y >= 758 && rest.y <= 780 && rest.x > 632.26 && rest.x < 768.26,
  };
}

// ---- 主流程：fb 前置 + wg 等驻东 + 站位 + 缝跳 ----
function fullRun(theta, pre, aHold, trace) {
  const w = makeWorld("forest_05");
  for (let f = 0; f < 30; f++) w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
  const log = [];
  const f0 = fbPrelude(w, (s) => log.push(s));
  // wg 站位先行（P3 tween 期间走位，落位须 ≥785.5 避扫掠刮擦）
  const walk = wgWalk(w, theta);
  // 等 P3 驻东且稳定
  let settle = 0, pf = p3x(w);
  for (let f = 0; f < 600; f++) {
    w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
    const x = p3x(w);
    if (x >= 700 && Math.abs(x - pf) < 0.01) settle++; else settle = 0;
    pf = x;
    if (settle >= 15) break;
  }
  const p3Final = +p3x(w).toFixed(2);
  const r = seamJump(w, pre, aHold, trace);
  return { ...r, walkX: +walk.x.toFixed(2), p3Final, fbLog: log };
}

// ---- 站位 θ 标定（确定性 → 迭代收敛 restX(θ)）----
function calibTheta(want, lo = 770, hi = 800) {
  let theta = want + 8;
  let best = null;
  for (let it = 0; it < 6; it++) {
    const r = fullRun(theta, -1, 0); // pre=-1 非法哨兵：只走位不跳
    // fullRun 里 pre=-1 会在 f=-1 触发 W——需旁路；改用专用标定 run
    best = r;
    const err = r.walkX - want;
    if (Math.abs(err) < 0.3) break;
    theta += err; // restX 随 θ 单调，直接反馈
  }
  return { theta, restX: best.walkX };
}

// 简化：标定走位专用（不含 fb，wg 单独世界；确定性等价——fb 输入恒 NONE 不影响 wg 轨迹）
function calibWalk(want) {
  let theta = want + 8, restX = 0;
  for (let it = 0; it < 8; it++) {
    const w = makeWorld("forest_05");
    for (let f = 0; f < 30; f++) w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
    const r = wgWalk(w, theta);
    restX = +r.x.toFixed(2);
    const err = restX - want;
    if (Math.abs(err) < 0.25) break;
    theta = Math.min(830, Math.max(760, theta - err)); // restX = θ − 滑停量：rest 偏小 → 增大 θ
  }
  return { theta: +theta.toFixed(2), restX };
}

const stances = [786, 787, 788, 789, 790, 791, 792, 792.8];
const pres = [0, 1, 2];
const holds = [12, 16, 20];

console.log("== 站位 θ 标定 ==");
const calib = [];
for (const want of stances) {
  const c = calibWalk(want);
  calib.push(c);
  console.log(`want=${want} → θ=${c.theta} restX=${c.restX}`);
}

const rows = [];
let hits = 0, total = 0;
let hitTrace = null;
for (const c of calib) {
  if (c.restX < 785.5 || c.restX > 793) { console.log(`跳过 restX=${c.restX}（窗外）`); continue; }
  for (const pre of pres) for (const hold of holds) {
    total++;
    const tr = [];
    const r = fullRun(c.theta, pre, hold, tr);
    const row = { restX: c.restX, theta: c.theta, pre, hold, ...r, fbLog: undefined };
    rows.push(row);
    if (r.onTop) {
      hits++;
      console.log(`HIT restX=${c.restX} pre=${pre} hold=${hold} takeoff=${JSON.stringify(r.takeoff)} rise=${r.rise} rest=(${r.restX},${r.restY}) P3=${r.p3Final}`);
      if (!hitTrace) hitTrace = { row, trace: tr };
    } else if (c.restX === calib[0].restX && pre === 1) {
      console.log(`  [样本] restX=${c.restX} pre=${pre} hold=${hold} rise=${r.rise} minY=${r.minY} rest=(${r.restX},${r.restY}) P3=${r.p3Final} walk=${JSON.stringify(r.fbLog)}`);
    }
  }
}
console.log(`\n== 汇总：${total} 组合，登顶命中 ${hits} ==`);
if (hitTrace) writeFileSync(new URL("./probe1-hit-trace.json", import.meta.url), JSON.stringify(hitTrace, null, 1));
writeFileSync(new URL("./probe1-sweep.json", import.meta.url), JSON.stringify({ summary: { total, hits }, calib, rows }, null, 1));
console.log("落盘 probe1-sweep.json", hitTrace ? "+ probe1-hit-trace.json" : "");

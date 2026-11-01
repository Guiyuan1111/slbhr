// fw-route-crystal3 槽 · crystal_03 环 10/11/12 探针（内核复现 oracle probe5c/5d/4-G/4-F/3-C）
// 环 10: fb floor320 东推 box→box 入狭缝带 (1216,272)→同 inverted 对速度镜像=西抛→落 row19；
//        fb 跟传入带→落 row19→贴箱东面西推上按钮 (pusher 1056,608)→state1
// 环 11: box 锁存→group4→升降柱 (720,528) 收起 tr→-3 (y[480,576]→[384,480])→柱下通道通过
// 环 12: 西段 fb 走台阶 576→544→512→缘跑跳东上壁龛板(224,448)→东行穿 P6 带→P7 东出口→fb 门 448；
//        wg row18 西段静跳上东楔(352,480)→西行穿 P6 带→P7 西出口→wg 门 96→双 isUp=WIN
// 注意：currentRunForce 初始 undefined——一切行走前先 sleep(3)。
// 用法: node --import tsx TEMP/fw-rc3-1/probe10.mjs [A|B|C|D]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const B = (await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "b2.js")).href)).b2();

const part = process.argv[2] ?? "A";
const NONE = { up: false, left: false, right: false };
const IN = (fb, wg = {}) => ({ fireboy: { ...NONE, ...fb }, watergirl: { ...NONE, ...wg } });
const place = (w, role, sx, syCenter) => {
  const body = w.players[role === "fb" ? "fireboy" : "watergirl"].body;
  body.SetPosition(new B.b2Vec2(-sx / 32, -syCenter / 32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
  body.SetAwake(true);
};
const placeBox = (w, sx, sy) => {
  const body = w.mechanisms.props[0].body;
  body.SetPosition(new B.b2Vec2(-sx / 32, -sy / 32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
  body.SetAwake(true);
};
const snap = (w, role) => {
  const s = w.snapshotPlayer(role === "fb" ? "fireboy" : "watergirl");
  return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), vx: +(s.vx ?? 0).toFixed(2), vy: +(s.vy ?? 0).toFixed(2), atDoor: s.atDoor, dead: s.dead || s.dying, phase: w.phase };
};
const feetOf = (s) => +(s.y + 35.2).toFixed(1);
const grounded = (w, role) => w.players[role === "fb" ? "fireboy" : "watergirl"].feetContacts.length > 0;
const boxPos = (w) => {
  const p = w.mechanisms.props[0]?.body.GetPosition();
  return p ? { x: +(-p.x * 32).toFixed(2), y: +(-p.y * 32).toFixed(2) } : null;
};
const mech = (w) => {
  const p = w.mechanisms.pushers[0];
  const pl = w.mechanisms.platforms[0];
  return { pusherState: p.state, pusherY: +(-p.body.GetPosition().y * 32).toFixed(1), platY: +(-pl.body.GetPosition().y * 32).toFixed(1) };
};

// ============================================================ A 部：环 10（fb 预置 floor320 推箱→双传→西推上按钮锁存）
// 关键机制（f141-f155 逐帧实证）：同 inverted 对出口速度=入口方向镜像+低速钳 |v|<10m/s→boost 10/mass；
// box 缓慢蹭入带(入口≈0 且含下落分量)→出口近垂直→落带内→冷却后回传弹回 floor320 (1140.61)。
// 解法：fb 全速冲刺撞箱→box 带速滚入(入口 vx 为主)→出口西向 228px/s→12f 冷却内滑出带西缘→不回传。
if (part === "A") {
  const w = makeWorld("crystal_03");
  place(w, "fb", 850, 284.8);
  const log = [];
  let boxTP = -1, fbTP = -1, latchF = -1;
  let lastBox = boxPos(w), lastFbX = 850;
  let phase = 0; // 0 冲刺撞箱 1 跟传 2 传后持续西行(借抛速+推箱) 3 静置观察
  for (let f = 0; f < 1500; f++) {
    const s = snap(w, "fb");
    const bx = boxPos(w);
    let inp = {};
    if (phase === 0 || phase === 1) inp = f < 3 ? {} : { right: true };
    else if (phase === 2) inp = { left: true };
    else inp = {};
    w.step(1 / 60, IN(inp));
    const a = snap(w, "fb");
    const m = mech(w);
    if (boxTP < 0 && lastBox && bx && Math.abs(bx.x - lastBox.x) > 40) {
      boxTP = f; log.push(`BOX-TP@f${f}: [${lastBox.x},${lastBox.y}] → [${bx.x},${bx.y}]`);
      phase = 1;
    }
    if (fbTP < 0 && Math.abs(a.x - lastFbX) > 40) {
      fbTP = f; log.push(`FB-TP@f${f}: ${lastFbX.toFixed(1)} → [${a.x},${a.y}]`);
      phase = 2;
    }
    if (phase === 2 && m.pusherState === 1 && latchF < 0) {
      latchF = f; log.push(`LATCH@f${f}: box=[${bx.x},${bx.y}] pusher=1 plat=${m.platY} fb=[${a.x},${a.y}]`);
      phase = 3;
    }
    lastBox = bx; lastFbX = a.x;
    if (f % 20 === 0 || (boxTP >= 0 && f < boxTP + 14) || (fbTP >= 0 && f < fbTP + 14) || (latchF >= 0 && f < latchF + 100 && f % 10 === 0)) {
      log.push(`f${f} ph${phase} fb=[${a.x},${a.y},feet${feetOf(a)},vx${a.vx}] box=[${bx.x},${bx.y}] pusher=${m.pusherState}/${m.pusherY} plat=${m.platY}${a.dead ? " DEAD" : ""}`);
    }
    if (a.dead) { log.push(`DEAD@f${f}`); break; }
    if (phase === 3 && f > latchF + 240) break;
  }
  const fin = snap(w, "fb");
  const m = mech(w);
  log.push(`END fb=[${fin.x},${fin.y},feet${feetOf(fin)}] box=[${boxPos(w).x},${boxPos(w).y}] pusher=${m.pusherState} plat=${m.platY}`);
  console.log("A 环10 log:");
  console.log(log.join("\n"));
  process.exit(0);
}

// ============================================================ F 部：oracle probe4-F 同预置复刻（主会话点名的决定性单实验）
// oracle: fb tp (40,476.8)（floor512 顶）；f30-49 东行(walk -1)；f49 跳；f49-75 空中保持东行；
//         终态=站立壁龛板 (244.5,412.5)（板顶 448，P6 带 y[352,448] 内）。内核若同预置能站上→
//         环 12 缺口只在进路（西壁台阶链）；站不上→真物理分歧，钉帧呈报。
if (part === "F") {
  const w = makeWorld("crystal_03");
  place(w, "fb", 40, 476.8);
  const log = [];
  let jumpF = -1;
  for (let f = 0; f < 300; f++) {
    let inp = {};
    if (f >= 30 && f < 49) inp = { right: true };
    else if (f === 49) { inp = { right: true, up: true }; jumpF = f; }
    else if (f > 49 && f < 75) inp = { right: true };
    w.step(1 / 60, IN(inp));
    const a = snap(w, "fb");
    if (f % 10 === 0 || (f >= 45 && f <= 130 && f % 2 === 0)) log.push(`f${f} [${a.x},${a.y},feet${feetOf(a)},vx${a.vx},vy${a.vy}] g=${grounded(w, "fb") ? 1 : 0}${a.dead ? " DEAD" : ""}`);
    if (a.dead) break;
  }
  const fin = snap(w, "fb");
  log.push(`FINAL fb=[${fin.x},${fin.y},feet${feetOf(fin)}] g=${grounded(w, "fb") ? 1 : 0}（oracle 终态 (244.5,412.5) 板顶 448）`);
  console.log("F probe4-F 复刻:");
  console.log(log.join("\n"));
  process.exit(0);
}

// ============================================================ B 部：wg 口袋纯东行走断（不跳）——落点实测
if (part === "B") {
  for (const holdF of [180, 240, 300]) {
    const w = makeWorld("crystal_03");
    place(w, "wg", 611, 220.5);
    let log = [];
    for (let f = 0; f < holdF + 240; f++) {
      w.step(1 / 60, IN({}, f < 3 ? {} : { right: true }));
      const a = snap(w, "wg");
      if (a.dead) { log.push(`DEAD@f${f} [${a.x},${a.y}]`); break; }
      if (f === holdF - 1) log.push(`hold-east-end@f${f} [${a.x},${a.y},feet${feetOf(a)},vx${a.vx}]`);
      if (f >= holdF) {
        w.step; // 已松键
      }
      if (f === holdF + 238) log.push(`END@f${f} [${a.x},${a.y},feet${feetOf(a)},vx${a.vx}] g=${grounded(w, "wg") ? 1 : 0}`);
    }
    console.log(`B hold-east ${holdF}f: ${log.join(" | ")}`);
  }
  process.exit(0);
}

// ============================================================ C 部：环 11+12（box 预置按钮上锁存→柱收→柱下通道→西段→双门 WIN）
if (part === "C") {
  const w = makeWorld("crystal_03");
  place(w, "fb", 1000, 572.8);   // row19
  place(w, "wg", 780, 540.8);    // row18 东段（oracle probe4-G 预置）
  placeBox(w, 1050, 578);        // box 直接置按钮上方
  const log = [];
  let latchF = -1;
  // 等 box 压按钮锁存 + 柱收起
  for (let f = 0; f < 260; f++) {
    w.step(1 / 60, IN({}, {}));
    const m = mech(w);
    if (latchF < 0 && m.pusherState === 1) { latchF = f; log.push(`LATCH@f${f} plat=${m.platY}`); }
    if (f === 130 || f === 250) log.push(`f${f} plat=${m.platY} pusher=${m.pusherState}`);
  }
  const m0 = mech(w);
  log.push(`pre-chain: pusher=${m0.pusherState} plat=${m0.platY}（收起=432）`);
  // 主链：fb 西行穿柱下通道→台阶→板跳东行穿带→门；wg 西行至 360 静跳上东楔→西行穿带→门
  let fbPhase = 0, wgPhase = 0, fbJumpF = -1, wgJumpF = -1;
  let fbDone = false, wgDone = false, won = false;
  for (let f = 0; f < 1600; f++) {
    const fb = snap(w, "fb");
    const wg = snap(w, "wg");
    let fi = {}, wi = {};
    // fb: 0 西行 row18 → 1 西行台阶至 512 → 2 缘(≤90)跑跳东 → 3 板上东行 → 4 传后东行进门
    if (fbPhase === 0) { fi = f < 3 ? {} : { left: true }; if (fb.x <= 620) fbPhase = 1; }
    else if (fbPhase === 1) { fi = { left: true }; if (fb.x <= 92 && Math.abs(fb.vx) > 7 && w.players.fireboy.feetContacts.length > 0) { fbPhase = 2; fbJumpF = f; log.push(`FB-JUMP@f${f} [${fb.x},${fb.y},vx${fb.vx}]`); } }
    else if (fbPhase === 2) { fi = f - fbJumpF < 12 ? { left: true, up: true } : { right: true }; if (fb.x > 150 && w.players.fireboy.feetContacts.length > 0 && f > fbJumpF + 14) fbPhase = 3; }
    else if (fbPhase === 3) { fi = { right: true }; }
    else { fi = { right: true }; }
    // wg: 0 西行至 ~365 → 1 静跳 → 2 空中/落板西行 → 3 传后西行进门
    if (wgPhase === 0) { wi = f < 3 ? {} : { left: true }; if (wg.x <= 366) { wgPhase = 1; wgJumpF = f; log.push(`WG-JUMP@f${f} [${wg.x},${wg.y},vx${wg.vx}]`); } }
    else if (wgPhase === 1) { wi = f - wgJumpF < 12 ? { up: true } : {}; }
    else if (wgPhase === 2) { wi = { left: true }; if (wg.y > 300 && wg.y < 350) { wgPhase = 3; log.push(`WG-TP@f${f} [${wg.x},${wg.y}]`); } }
    else { wi = { left: true }; }
    w.step(1 / 60, IN(fi, wi));
    const a = snap(w, "fb");
    const g = snap(w, "wg");
    if (f % 30 === 0) log.push(`f${f} fb(ph${fbPhase})=[${a.x},${a.y},feet${feetOf(a)}] wg(ph${wgPhase})=[${g.x},${g.y},feet${feetOf(g)}]`);
    if (a.dead || g.dead) { log.push(`DEAD@f${f} fb=${a.dead} wg=${g.dead}`); break; }
    if (!fbDone && a.atDoor) { fbDone = true; log.push(`FB-AT-DOOR@f${f} [${a.x},${a.y}]`); }
    if (!wgDone && g.atDoor) { wgDone = true; log.push(`WG-AT-DOOR@f${f} [${g.x},${g.y}]`); }
    if (w.phase === "won") { won = true; log.push(`WON@f${f}`); break; }
  }
  log.push(`END phase=${w.phase} fbDoor=${fbDone} wgDoor=${wgDone}`);
  console.log("C 环11+12 log:");
  console.log(log.join("\n"));
  process.exit(0);
}
console.log("unknown part", part);

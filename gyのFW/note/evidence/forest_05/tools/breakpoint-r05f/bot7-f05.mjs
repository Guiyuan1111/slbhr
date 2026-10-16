// f05 路线求解 v7（r05f）：P3摆渡全线（西梯共享架构）
//  架构（W6封死+W13弹道封死后的唯一通路）：
//  - 无人翻杆1，P2 常驻西位 [512,640]@419-447
//  - fb: 地板→P3西(804)→西704台→杆2首翻(0→1,P3东移载wg上东梯)→驻410
//    ←等wg东梯毕落回P3东← 反向再翻杆2(1→0,P3西移128载wg回西)
//    →共梯: J3→P1西 | T5刀锋→西512 | J5→P2西 | T6刀锋→西320 | J9→中心块
//    →J10东跳b32→1056东端→落b2顶(188)→配重下行→core≥528西跳tap→右ledge→fb门948
//  - wg: 等杆2→W3→W4→W5a→W5b→杆3(P1西移)→降回P3东→乘P3西移→西跳西704
//    →共梯同fb→W9西跳走道→W10竖井墬落(中性+延迟东漂)→左ledge→wg门304
//  身体模型：头顶=core-21.76，脚底=core+35.2；满跳rise=102.5(vy-479.3,g≈1120)；跑加速600
//  原语 S2p 逐字沿用 bot6-f05.mjs（S1/W3/S2 已实证），runJump holdF=0 即空中零输入恒速弹道
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, drive, toRouteDoc } from "../../../../../scripts/e2e/routetool/botcore.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const TOTAL = Number(argOf("total", "2200"));

// ---- 可扫参数 ----
const P = {
  w4_pos: 705, w4_pre: 11, w4_hold: 22,      // W4 斜尖避让修正
  w5a_pos: 800, w5a_line: 778, w5a_hold: 18, // W5a 平台满速起跳
  w5b_pos: 712, w5b_line: 714,               // W5b 斜尖穿针(vx≈49中性)
  st3_x: 826,
  ed1_pos: 742, ed2_pos: 780, ed2_hold: 8,
  ride_pos: 543, ride_pre: 7, ride_hold: 45,
  j3_pos: 424, j3_line: 454,
  t5_pos: 536, t5_drift: 5, t5_hold: 22,     // T5 起位536(斜尖15.36净距)
  j5_pos: 451, j5_line: 465,
  t6_pos: 536, t6_drift: 5, t6_hold: 22,
  j9_pos: 444, j9_line: 472,
  w9_pos: 560, w9_line: 505,
  j10_pos: 640, j10_line: 682,
  b2hop_y: 528, b2_tap: 18,
};
for (const a of args) { const m = a.match(/^--p:(\w+)=(-?[\d.]+)$/); if (m) P[m[1]] = Number(m[2]); }

// ---- 谓词 ----
const ms = (c) => c.w.mechSnapshot();
const p3East = (c) => ms(c).platforms[2].x >= 690;
const p3West = (c) => ms(c).platforms[2].x <= 585;
const lev2On = (c) => ms(c).levers[1].state === 1;
const lev2Off = (c) => ms(c).levers[1].state === 0;
const lev3On = (c) => ms(c).levers[2].state === 1;

// ---- 原语（S2p 逐字沿用 bot6-f05.mjs）----
const S2p = {
  wait: (pred, name) => ({ name, run: () => NONE, done: pred }),
  sleep: (n, name) => { let t = 0; return { name, run: () => NONE, done: () => ++t >= n }; },
  goTo: S.goTo,
  /** 走到线后助跑跳：hold dir 累速，core_x 过 line 且落地即跳，空中继续 dir 直到落地(holdF=0→空中零输入) */
  runJump: (dir, line, holdF, name) => {
    let jumped = false, air = false, t = 0;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (!jumped) {
          if (c.me.grounded && (dir === "right" ? c.me.x >= line : c.me.x <= line)) { i.up = true; jumped = true; t = 0; }
          return i;
        }
        t++;
        if (t > holdF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 停稳→ creep dir preRun 帧（vx≈10·pre）→ 起跳并持 dir holdF 帧 */
  creepJump: (dir, preRun, holdF, name) => {
    let phase = 0, t = 0, jumped = false, air = false;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (phase === 0) { if (c.me.grounded && Math.abs(c.me.vx) < 30) phase = 1; return NONE; }
        if (phase === 1) { if (++t >= preRun) { i.up = true; phase = 2; t = 0; jumped = true; } return i; }
        t++;
        if (t > holdF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 垂直 razor：站定起跳，driftAtF 帧后持 dir holdF 帧（T5/T6 用） */
  razorJump: (dir, driftAtF, holdF, name) => {
    let jumped = false, air = false, t = 0;
    return {
      name,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded && Math.abs(c.me.vx) < 20) { jumped = true; t = 0; return { ...NONE, up: true }; }
          return NONE;
        }
        t++;
        if (t >= driftAtF && t <= driftAtF + holdF) return { ...NONE, [dir]: true };
        return NONE;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 缘口坠落：蠕 dir 2f 出缘，空中压反向 holdF 帧后刹 */
  edgeDrop: (dir, holdF, name) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false;
    return {
      name,
      run: (c) => {
        if (!off) {
          if (t >= 2 && !c.me.grounded) { off = true; t = 0; return { ...NONE, [anti]: true }; }
          t++; return { ...NONE, [dir]: true };
        }
        t++;
        if (t <= holdF) return { ...NONE, [anti]: true };
        const moving = dir === "right" ? c.me.vx < -30 : c.me.vx > 30;
        return moving ? { ...NONE, [dir]: true } : NONE;
      },
      done: (c) => off && c.me.grounded && c.me.vy >= -8,
    };
  },
  /** 竖井墬落：蠕 dir 出缘→中性落至 feet≥yThen→压反向 dir 直到落地（W10 用） */
  shaftDrop: (dir, yThen, name) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false;
    return {
      name,
      run: (c) => {
        if (!off) {
          if (t >= 2 && !c.me.grounded) { off = true; t = 0; return NONE; }
          t++; return { ...NONE, [dir]: true };
        }
        return c.me.y + 35.2 >= yThen ? { ...NONE, [anti]: true } : NONE;
      },
      done: (c) => off && c.me.grounded && c.me.vy >= -8,
    };
  },
};

// ---- fb 线 ----
const fb = [
  S.settle("落定"), S2p.sleep(6, "起手"),
  S2p.runJump("right", 450, 30, "S1 地板→P3西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 830 && c.me.x > 504, "P3西落定"),
  S2p.goTo(548, 4, "S2走位"),
  S2p.creepJump("left", 7, 45, "S2 西跳西704台"),
  S2p.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x < 500, "西704落定"),
  { name: "杆2首翻(持L穿杆)", run: (c) => ({ ...NONE, left: true }), done: (c) => lev2On(c) && c.me.x <= 412 },
  S2p.sleep(12, "杆2确认"),
  S2p.wait((c) => lev3On(c) && c.other.grounded && c.other.y > 760 && c.other.x > 630, "等wg东梯毕回P3东"),
  S2p.goTo(410, 5, "退到杆2西侧"),
  { name: "杆2再翻(持R推杆东)", run: (c) => ({ ...NONE, right: true }), done: (c) => lev2Off(c) && c.me.x >= 432 },
  // 共梯
  S2p.goTo(P.j3_pos, 6, "J3跑道"),
  S2p.runJump("right", P.j3_line, 0, "J3 西704→P1西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 645 && c.me.x > 490, "P1西落定"),
  S2p.goTo(P.t5_pos, 2, "T5驻位"),
  S2p.razorJump("left", P.t5_drift, P.t5_hold, "T5 razor→西512"),
  S2p.wait((c) => c.me.grounded && c.me.y < 560 && c.me.x < 520, "西512落定"),
  S2p.goTo(P.j5_pos, 2, "J5跑道"),
  S2p.runJump("right", P.j5_line, 0, "J5 西512→P2西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 460 && c.me.x > 512, "P2西落定"),
  S2p.goTo(P.t6_pos, 2, "T6驻位"),
  S2p.razorJump("left", P.t6_drift, P.t6_hold, "T6 razor→西320"),
  S2p.wait((c) => c.me.grounded && c.me.y < 368 && c.me.x < 520, "西320落定"),
  S2p.goTo(P.j9_pos, 3, "J9跑道"),
  S2p.runJump("right", P.j9_line, 0, "J9 西320→中心块"),
  S2p.wait((c) => c.me.grounded && c.me.y < 280 && c.me.x > 518, "中心块落定"),
  // 出口
  S2p.goTo(P.j10_pos, 4, "J10跑道"),
  S2p.runJump("right", P.j10_line, 0, "J10 中心块→东@128"),
  S2p.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x > 768, "b32走道落定"),
  S2p.goTo(1046, 3, "东行走道端"),
  S2p.edgeDrop("right", 7, "东出台缘落b2顶"),
  S2p.wait((c) => c.me.grounded && c.me.y > 130 && c.me.y < 260 && c.me.x > 1055, "b2乘坐确认"),
  { name: "b2下行·core到点西跳", run: (c) => (c.me.grounded && c.me.y >= P.b2hop_y ? { ...NONE, up: true, left: true } : NONE), done: (c) => !c.me.grounded },
  { name: "b2西跳tap压左", run: (c) => { b2Tap++; return b2Tap <= P.b2_tap ? { ...NONE, left: true } : NONE; }, done: (c) => c.me.grounded && c.me.y < 580 && c.me.x > 890 && c.me.x < 1056 },
  S2p.goTo(946, 6, "西行fb门带"),
  S2p.sleep(400, "驻门WIN"),
];
let b2Tap = 0;

// ---- wg 线 ----
const wg = [
  S.settle("落定"), S2p.sleep(6, "起手"),
  S2p.wait((c) => lev2On(c) && p3East(c), "等fb杆2首翻→P3东驻"),
  S.hold("left", (c) => c.me.x <= 812 && c.me.grounded, "西行起跳位"),
  S2p.goTo(735, 4, "W3驻位"),
  S2p.creepJump("left", 8, 5, "W3 西跳P3东(单向跳穿)"),
  S2p.wait((c) => c.me.grounded && c.me.y < 830 && c.me.x > 630, "P3东落定"),
  S2p.goTo(P.w4_pos, 4, "W4驻位"),
  S2p.creepJump("right", P.w4_pre, P.w4_hold, "W4 跳东704台"),
  S2p.wait((c) => c.me.grounded && c.me.y < 690 && c.me.y > 640 && c.me.x > 760, "东704落定"),
  S2p.goTo(P.w5a_pos, 4, "W5a驻位"),
  S2p.runJump("left", P.w5a_line, P.w5a_hold, "W5a 西跳P1东"),
  S2p.wait((c) => c.me.grounded && c.me.y < 640 && c.me.x > 608, "P1东落定"),
  S2p.goTo(P.w5b_pos, 4, "W5b驻位"),
  S2p.runJump("right", P.w5b_line, 0, "W5b 东跳东512斜面"),
  S2p.wait((c) => c.me.grounded && c.me.y < 560 && c.me.y > 460 && c.me.x >= 768, "东512落定(滑至平台)"),
  { name: "杆3(持R穿杆,P1西移)", run: (c) => ({ ...NONE, right: true }), done: (c) => lev3On(c) && c.me.x >= P.st3_x },
  S2p.goTo(P.ed1_pos, 5, "降回驻位1"),
  S2p.edgeDrop("left", 6, "西出台缘落东704"),
  S2p.wait((c) => c.me.grounded && c.me.y < 745 && c.me.y > 640, "东704回落"),
  S2p.goTo(740, 5, "降回驻位2(坡尖)"),
  S2p.edgeDrop("left", 0, "坡尖坠落P3东"),
  S2p.wait((c) => c.me.grounded && c.me.y > 760 && c.me.x > 630, "P3东乘坐"),
  S2p.wait((c) => p3West(c) && c.me.grounded, "乘P3西移"),
  S2p.goTo(548, 4, "P3西走位(对齐fb实证S2)"),
  S2p.creepJump("left", P.ride_pre, P.ride_hold, "西跳西704台"),
  S2p.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x < 500, "西704落定"),
  // 共梯（fb已在其上，无角色碰撞直接跟进）
  S2p.goTo(P.j3_pos, 6, "J3跑道"),
  S2p.runJump("right", P.j3_line, 0, "J3 西704→P1西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 645 && c.me.x > 490, "P1西落定"),
  S2p.goTo(P.t5_pos, 2, "T5驻位"),
  S2p.razorJump("left", P.t5_drift, P.t5_hold, "T5 razor→西512"),
  S2p.wait((c) => c.me.grounded && c.me.y < 560 && c.me.x < 520, "西512落定"),
  S2p.goTo(P.j5_pos, 2, "J5跑道"),
  S2p.runJump("right", P.j5_line, 0, "J5 西512→P2西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 460 && c.me.x > 512, "P2西落定"),
  S2p.goTo(P.t6_pos, 2, "T6驻位"),
  S2p.razorJump("left", P.t6_drift, P.t6_hold, "T6 razor→西320"),
  S2p.wait((c) => c.me.grounded && c.me.y < 368 && c.me.x < 520, "西320落定"),
  S2p.goTo(P.j9_pos, 3, "J9跑道"),
  S2p.runJump("right", P.j9_line, 0, "J9 西320→中心块"),
  S2p.wait((c) => c.me.grounded && c.me.y < 280 && c.me.x > 518, "中心块落定"),
  // 出口
  S2p.goTo(P.w9_pos, 6, "W9跑道"),
  S2p.runJump("left", P.w9_line, 0, "W9 中心块→西走道"),
  S2p.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x < 470, "走道落定"),
  { name: "西行走道端出缘", run: (c) => ({ ...NONE, left: true }), done: (c) => !c.me.grounded || c.me.x <= 202 },
  S2p.shaftDrop("left", 450, "W10 竖井墬落东漂"),
  S2p.wait((c) => c.me.grounded && c.me.y > 480 && c.me.y < 560 && c.me.x > 215 && c.me.x < 330, "左ledge落定"),
  S2p.goTo(304, 6, "东行wg门带"),
  S2p.sleep(500, "驻门WIN"),
];

const w = makeWorld("forest_05");
const mechLog = [];
const r = drive(w, { fb, wg }, TOTAL, {
  logSteps: true, traceAll: true,
  onFrame: (f) => {
    if (f % 30 !== 0) return;
    const m = w.mechSnapshot();
    const st = w.mechanisms.levers.map((l) => l.state).join(",");
    const sig = `${m.platforms.map((p) => p.x.toFixed(0)).join("/")}|${st}`;
    if (mechLog.length && mechLog[mechLog.length - 1].sig === sig) return;
    mechLog.push({ f, sig });
    console.log(`[mech] f${f} P=${m.platforms.map((p) => p.x.toFixed(0)).join("/")} levers=${st}`);
  },
});
writeFileSync(fileURLToPath(new URL("./trace7.json", import.meta.url)), JSON.stringify(r.trace));
console.log("result:", JSON.stringify(r.result));
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log(`final fb=(${fbS.x.toFixed(1)},${fbS.y.toFixed(1)}) wg=(${wgS.x.toFixed(1)},${wgS.y.toFixed(1)}) phase=${w.phase} fbDoor=${fbS.doorFrame}/${fbS.atDoor} wgDoor=${wgS.doorFrame}/${wgS.atDoor}`);
const out = argOf("out", "");
if (out && r.result.won) {
  const doc = toRouteDoc("forest_05", r.events, Math.min(TOTAL, (r.result.winF ?? TOTAL) + 3), "r05f bot7 P3摆渡全线");
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log("route →", out, "fb/wg 事件:", doc.fb.length, doc.wg.length);
}

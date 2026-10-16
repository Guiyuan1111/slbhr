// f05 路线求解 v8（r05g）：bot7 架构复活版——W3 改用 o05a oracle 东缝跳配方（05号档 §5/§9）
//  变更点（对 bot7-f05.mjs）：
//  1. wg W3 弃"西跳P3东单向跳穿"（03号档已判无效前提），改为：
//     站位窗走位(θ 门控+实跑闭环确认 restX∈[785.5,792.8]) → 等P3驻东稳定 →
//     seamJump(A 预压 pre f → W 持 2f → 空中 A 保持 aHold f) → 登顶确认。
//  2. 新原语 seamJump/waitP3Rest（oracle p4-sweep 输入时序逐帧移植）。
//  3. 其余（fb 线、共梯、b2 端game、W4 降回、乘西移、W9/W10）逐字沿用 bot7（r05c/r05d 实证参数表）。
//  用法：cd gyのFW && node --import tsx ../TEMP/r05g2/bot8-g2.mjs [--total 3000] [--p:k=v ...] [--out xx.json]
//  r05g2 变更（对 r05g bot8 草稿）：
//  a. fb J3 前补 waitP1Rest（教训1：前置链缺位则跳空——P1 tween 未驻西即跳=跳空落死）；
//  b. wg 补蓝钻绕行（east704 x=826 / 中心块 x=676，gem 中心 (832,672)/(672,192)）；
//  c. W10 出缘模式参数化（w10_mode 0/1/2，几何预演：出缘 vx>~30px/s 则竖井西飘错过左ledge）。
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, drive, toRouteDoc } from "../../../../../scripts/e2e/routetool/botcore.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const TOTAL = Number(argOf("total", "3000"));

// ---- 可扫参数（bot7 原表 + w3' 新参）----
const P = {
  w3_theta: 802, w3_pre: 1, w3_ahold: 20,   // W3' oracle HIT 配方（790/pre1/hold20；θ 站位释放线）
  gem704: 826, gem640: 676,                  // 蓝钻驻点（中心 (832,672)/(672,192)），r05g2 补
  w10_mode: 0,                               // 0=bot7原版出缘 1=先驻241再出缘 2=慢速坡道出缘
  w4_mode: 0, w4_pos2: 692, w4_drift: 8,     // W4 mode2=站跳右漂（r05g2：creep 版 ±1f 必撞楔尖，MC 撑不住）
  w4_pos: 705, w4_pre: 11, w4_hold: 22,      // W4 斜尖避让修正（legacy creep 版）
  w5b_mode: 0, w5b_pos2: 700, w5b_drift: 6,  // W5b mode2=站跳右漂（同 W4 理由）
  // r05g2-B：东梯顶新链（墙柱三槽32px全封、中央走廊对角色不可穿越——geo 全图实证）：
  //   东512 缝跳西上 P2东（fb 杆1 后驻 [640,768]@419）→ razor 东320 → razor 西越顶中心块(收钻) → bot7 W9/W10 门尾
  w6x2_pos: 805,                             // W6x' 东512 razor缝跳（悬挑甲板封跑步跳，起跳位）
  w6y_pos: 700, w6y_drift: 2,                // W6y P2东→东320 站跳右漂（drift4 落台西角768；楔尖净距razor）
  j9w_pos: 878, j9w_line: 804,               // J9w 东320 长助跑西越顶中心块（顶净距6.25px，落东角窗≤719）
  w5a_pos: 800, w5a_line: 778, w5a_hold: 18, // W5a 平台满速起跳
  w5b_pos: 712, w5b_line: 714,               // W5b 斜尖穿针(vx≈49中性)
  st3_x: 826,
  ed1_pos: 742, ed2_pos: 780, ed2_hold: 8,
  ride_pos: 543, ride_pre: 7, ride_hold: 45,
  j3_pos: 438,                              // r05g2: P1西甲板悬面封跑步跳（脚圆h≈53撞板底）；改razor缝跳：core≤444.8起跳垂直升，t24后右漂落甲板西角窗[451,593]
  t5_pos: 536, t5_drift: 5, t5_hold: 22,     // T5 起位536(斜尖15.36净距)
  j5_pos: 470,                              // r05g2: J5 改 razor(悬挑甲板封跑步跳，同J3)
  t6_pos: 535, t6_drift: 4, t6_hold: 22,    // r05g2: T6 razor 535∈P2西站位窗[527.4,624.6]；drift 4 越西320东面
  j9_pos: 436, j9_line: 458,                // r05g2: J9 长助跑(60px, vx≈200)才能落中心块西半
  w9_pos: 578, w9_line: 560,                 // r05g2: 台西缘559.36上方起跳+hold30空漂补距
  j10_pos: 640, j10_line: 682,
  b2hop_y: 590, b2_tap: 30,  // r05g2: 528 起跳顶点 core 417 撞东上层檐板@416 东棱(1024,416-448)削速坠亡；590+tap30 穿面后落@544 檐板 ~994
  fb_b2wait: 0,              // r05g2-E: fb 在 b32 待机 N 帧再登 b2——滑轮纯重力联动无棘轮（遥测实证：fb 离车即回沉，
                             //   wg f1595 落上车顶被载入毒池）。fb 压 b2 = wg 车升力，登车时刻须与 wg 井口跳联锁（默认 0，跑 121）
};
for (const a of args) { const m = a.match(/^--p:(\w+)=(-?[\d.]+)$/); if (m) P[m[1]] = Number(m[2]); }

// ---- 谓词 ----
const ms = (c) => c.w.mechSnapshot();
const p3East = (c) => ms(c).platforms[2].x >= 690;
const p3West = (c) => ms(c).platforms[2].x <= 585;
const lev1On = (c) => ms(c).levers[0].state === 1;
const lev2On = (c) => ms(c).levers[1].state === 1;
const lev2Off = (c) => ms(c).levers[1].state === 0;
const lev3On = (c) => ms(c).levers[2].state === 1;

// ---- 原语（S2p 逐字沿用 bot7-f05.mjs）----
const S2p = {
  wait: (pred, name) => ({ name, run: () => NONE, done: pred }),
  // r05g2-F（MC 抗抖改造）：单段长按走——一次 down 一次 up，到位滑行自停。
  //  事件数 2（对比 goTo 震荡 ~20-40）。落点确定性与滑行距离绑定，容差段用。
  // r05g2-F（MC 抗抖走位）：自动定向；快跑→vx 预测滑停点释放（被动摩擦 0.478px/f²，滑距=v²/0.956，
  //  实测 4.5px/f→21.2px）→ 稳速后残差 3f 脉冲蠕动。事件数 ~2-14（对比 goTo 震荡 20-45）。vx 单位 px/s。
  holdGo: (x, tol = 4, name) => {
    let phase = 0, t = 0, creepT = -9, blocked = 0;
    return {
      name: name || ("hold" + x),
      run: (c) => {
        const d = x - c.me.x;
        const dir = d > 0 ? "right" : "left";
        if (phase === 0) {
          if (!c.me.grounded) { blocked = 0; return NONE; }
          const v = Math.abs(c.me.vx) / 60;
          const bd = (v * v) / 0.956;
          if (Math.abs(d) <= bd + 2) { phase = 1; creepT = c.f; return NONE; }
          // 顶墙检测：持向但 6f 不动（目标在墙外，tol 内即达标）
          blocked = Math.abs(c.me.vx) < 5 ? blocked + 1 : 0;
          if (blocked >= 6) { phase = 2; creepT = c.f; return NONE; }
          return { ...NONE, [dir]: true };
        }
        if (phase === 1) {
          if (!c.me.grounded || Math.abs(c.me.vx) >= 25) return NONE;
          phase = 2;
        }
        // phase 2: 蠕动到窗（3f 压 / 3f 停，~1px/周期）
        if (!c.me.grounded) return NONE;
        const k = (c.f - creepT) % 6;
        if (Math.abs(d) <= tol) return NONE;
        if (Math.abs(c.me.vx) >= 60 && k !== 0) return NONE;
        return k < 3 ? { ...NONE, [dir]: true } : NONE;
      },
      done: (c) => { t++; return phase === 2 && t >= 8 && c.me.grounded && Math.abs(c.me.vx) < 25 && Math.abs(c.me.x - x) <= tol; },
    };
  },
  sleep: (n, name) => { let t = 0; return { name, run: () => NONE, done: () => ++t >= n }; },
  goTo: S.goTo,
  runJump: (dir, line, holdF, name, coastF = 0) => {
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
        // r05g2: 空中阻尼 vx≈×0.878/f（trace8 实测 243→12px/s/24f）——先滑翔 coastF 帧再持向，
        //   延迟水平加速可同时满足"脸面净距(晚过面)"与"落点深度(持向补距)"两个互斥约束
        if (t <= coastF) return NONE;
        if (t > coastF + holdF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
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
  edgeDrop: (dir, holdF, name) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false, airStreak = 0;
    return {
      name,
      run: (c) => {
        if (!off) {
          // r05g2-F: 甲板缝会有 1-2f 假离地——连续 ≥4f 离地才算真跌落
          airStreak = c.me.grounded ? 0 : airStreak + 1;
          if (t >= 2 && airStreak >= 4) { off = true; t = 0; return { ...NONE, [anti]: true }; }
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

// ---- 新原语（r05g）----
/** P2 tween 驻东稳定：x≥700 且连续 15 帧位稳（fb 杆1 翻转后 wg 才可缝跳） */
const waitP2Rest = (name = "P2驻东稳定") => ({
  name,
  run: () => NONE,
  done: (c) => {
    const x = ms(c).platforms[1].x;
    c.mem.px2 ??= 999; c.mem.n2 ??= 0;
    if (x >= 700 && Math.abs(x - c.mem.px2) < 0.01) c.mem.n2++; else c.mem.n2 = 0;
    c.mem.px2 = x;
    return c.mem.n2 >= 15;
  },
});
/** W3' 站位走：hold left 至 x≤θ，落定确认（实跑闭环，防离线标定历史依赖） */
const stanceWalk = (theta, name) => ({
  name,
  run: (c) => (c.me.grounded && c.me.x > theta ? { ...NONE, left: true } : NONE),
  done: (c) => c.me.grounded && c.me.x <= theta && Math.abs(c.me.vx) < 2,
});
/** P3 tween 驻东稳定：x≥700 且连续 15 帧位稳 */
const waitP3Rest = (name = "P3驻东稳定") => ({
  name,
  run: () => NONE,
  done: (c) => {
    const x = ms(c).platforms[2].x;
    c.mem.px ??= 999; c.mem.n ??= 0;
    if (x >= 700 && Math.abs(x - c.mem.px) < 0.01) c.mem.n++; else c.mem.n = 0;
    c.mem.px = x;
    return c.mem.n >= 15;
  },
});
/** P1 tween 驻西稳定（西位中心 544）：连续 15 帧位稳且 ≤556（r05g2 教训1：缺前置门控则跳空） */
const waitP1Rest = (name = "P1驻西稳定") => ({
  name,
  run: () => NONE,
  done: (c) => {
    const x = ms(c).platforms[0].x;
    c.mem.px ??= 999; c.mem.n ??= 0;
    if (x <= 556 && Math.abs(x - c.mem.px) < 0.01) c.mem.n++; else c.mem.n = 0;
    c.mem.px = x;
    return c.mem.n >= 15;
  },
});
/** W3' 东缝跳（oracle p4-sweep 时序逐帧移植，激活帧=f0）：
 *  f0: A down；f=pre: +W down；f=pre+1: W 仍持（共 2f=34ms）；f=pre+2: W up；
 *  f=pre+2+aHold: A up；完成=再落地 */
const seamJump = (pre, aHold, name) => {
  let f0 = null;
  return {
    name,
    run: (c) => {
      if (f0 === null) f0 = c.f;
      const k = c.f - f0;
      if (k === 0) return { ...NONE, left: true };
      if (k > pre + 2 + aHold) return NONE;
      const i = { ...NONE, left: true };
      if (k === pre || k === pre + 1) i.up = true;
      return i;
    },
    done: (c) => {
      if (f0 === null) return false;
      const k = c.f - f0;
      if (k <= pre + 2 + aHold) return false;
      let air = (c.mem.air ??= false);
      if (!c.me.grounded) c.mem.air = air = true;
      return air && c.me.grounded && c.me.vy >= -8;
    },
  };
};

// ---- fb 线（bot7 逐字，仅末段 sleep 保底）----
const fb = [
  S.settle("落定"), S2p.sleep(6, "起手"),
  S2p.runJump("right", 450, 30, "S1 地板→P3西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 830 && c.me.x > 504, "P3西落定"),
  S2p.holdGo(548, 4, "S2走位"),
  S2p.creepJump("left", 7, 45, "S2 西跳西704台"),
  S2p.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x < 500, "西704落定"),
  { name: "杆2首翻(持L穿杆)", run: (c) => ({ ...NONE, left: true }), done: (c) => lev2On(c) && c.me.x <= 412 },
  S2p.sleep(12, "杆2确认"),
  // r05g2: 杆2不回翻（probe3b 实证 state1 穿行无 toggle，P3 驻东至终局）；fb 唯一 wg 耦合=P1 驻西门控
  waitP1Rest("等P1驻西(杆3已翻+tween完)"),
  // 共梯
  S2p.holdGo(P.j3_pos, 6, "J3跑道"),
  S2p.razorJump("right", 8, 30, "J3 razor缝跳 西704→P1西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 645 && c.me.x > 455, "P1西落定"),
  S2p.holdGo(P.t5_pos, 2, "T5驻位"),
  S2p.razorJump("left", P.t5_drift, P.t5_hold, "T5 razor→西512"),
  S2p.wait((c) => c.me.grounded && c.me.y < 560 && c.me.x < 520, "西512落定"),
  S2p.holdGo(P.j5_pos, 2, "J5跑道"),
  S2p.razorJump("right", 8, 30, "J5 razor缝跳 西512→P2西"),
  S2p.wait((c) => c.me.grounded && c.me.y < 460 && c.me.x > 512, "P2西落定"),
  S2p.holdGo(P.t6_pos, 2, "T6驻位"),
  S2p.razorJump("left", P.t6_drift, P.t6_hold, "T6 razor→西320"),
  S2p.wait((c) => c.me.grounded && c.me.y < 368 && c.me.x < 520, "西320落定"),
  // r05g2-B：杆1（西320 上，P2 西→东）——wg 东梯顶缝跳的前置；fb 此后不再用 P2
  { name: "杆1(持L穿杆,P2东移)", run: (c) => ({ ...NONE, left: true }), done: (c) => lev1On(c) },  // r05g2: 翻杆瞬间人被摇臂垫高，x 门控会卡死——杆1 翻转即达标（J9 跑道会重新走位）
  S2p.sleep(12, "杆1确认"),
  S2p.holdGo(P.j9_pos, 3, "J9跑道"),
  S2p.runJump("right", P.j9_line, 25, "J9 西320→中心块", 8),
  S2p.wait((c) => c.me.grounded && c.me.y < 280 && c.me.x > 518, "中心块落定"),
  // 出口
  { name: "J10跑道(纯右行门控)", run: (c) => (c.me.grounded && c.me.x < 660 ? { ...NONE, right: true } : NONE), done: (c) => c.me.grounded && c.me.x >= 655 },  // r05g2: goTo 抖振会带落块缘，改纯右行
  S2p.runJump("right", P.j10_line, 25, "J10 中心块→东@128"),
  S2p.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x > 768, "b32走道落定"),
  S2p.sleep(P.fb_b2wait, "fb待b2时机(等wg井口跳联锁)"),
  S2p.holdGo(1046, 8, "东行走道端"),
  S2p.edgeDrop("right", 7, "东出台缘落b2顶"),
  S2p.wait((c) => c.me.grounded && c.me.y > 130 && c.me.y < 260 && c.me.x > 1055, "b2乘坐确认"),
  { name: "b2下行·core到点西跳", run: (c) => (c.me.grounded && c.me.y >= P.b2hop_y ? { ...NONE, up: true, left: true } : NONE), done: (c) => !c.me.grounded },
  { name: "b2西跳tap压左", run: (c) => { b2Tap++; return b2Tap <= P.b2_tap ? { ...NONE, left: true } : NONE; }, done: (c) => c.me.grounded && c.me.y < 580 && c.me.x > 890 && c.me.x < 1056 },
  S2p.holdGo(940, 24, "西行fb门带(宽公差)"),
  S2p.sleep(400, "驻门WIN"),
];
let b2Tap = 0;

// ---- wg 线（W3' 换装，其余 bot7 逐字）----
const wg = [
  S.settle("落定"), S2p.sleep(6, "起手"),
  stanceWalk(P.w3_theta, "W3'站位走"),
  S2p.wait((c) => p3East(c), "等P3驻东"),
  waitP3Rest("P3 tween 稳定"),
  S2p.wait((c) => c.me.grounded && Math.abs(c.me.vx) < 2 && c.me.x >= 785.5 && c.me.x <= 792.8, "站位门控"),
  seamJump(P.w3_pre, P.w3_ahold, "W3' 东缝跳"),
  S2p.wait((c) => c.me.grounded && c.me.y < 785 && c.me.y > 740 && c.me.x > 632 && c.me.x < 768, "登顶确认"),
  ...(P.w4_mode === 2 ? [
    S2p.holdGo(P.w4_pos2, 2, "W4驻位2(站定)"),
    S2p.razorJump("right", P.w4_drift, 40, "W4 站跳右漂越楔"),
  ] : [
    S2p.goTo(P.w4_pos, 4, "W4驻位"),
    S2p.creepJump("right", P.w4_pre, P.w4_hold, "W4 跳东704台"),
  ]),
  S2p.wait((c) => c.me.grounded && c.me.y < 690 && c.me.y > 640 && c.me.x > 760, "东704落定"),
  S2p.holdGo(P.gem704, 8, "蓝钻·东704(832,672)"),
  S2p.holdGo(P.w5a_pos, 4, "W5a驻位"),
  S2p.runJump("left", P.w5a_line, P.w5a_hold, "W5a 西跳P1东"),
  S2p.wait((c) => c.me.grounded && c.me.y < 640 && c.me.x > 608, "P1东落定"),
  ...(P.w5b_mode === 2 ? [
    S2p.holdGo(P.w5b_pos2, 2, "W5b驻位2(站定)"),
    S2p.razorJump("right", P.w5b_drift, 40, "W5b 站跳右漂上东512"),
  ] : [
    S2p.goTo(P.w5b_pos, 4, "W5b驻位"),
    S2p.runJump("right", P.w5b_line, 0, "W5b 东跳东512斜面"),
  ]),
  S2p.wait((c) => c.me.grounded && c.me.y < 560 && c.me.y > 460 && c.me.x >= 768, "东512落定(滑至平台)"),
  { name: "杆3助跑(西退30px)", run: (c) => (c.me.grounded && c.me.x > 782 ? { ...NONE, left: true } : NONE), done: (c) => c.me.grounded && c.me.x <= 782 },
  { name: "杆3(持R穿杆,P1西移)", run: (c) => ({ ...NONE, right: true }), done: (c) => lev3On(c) && c.me.x >= P.st3_x },
  waitP1Rest("等P1驻西(防西跳撞tween)"),
  // r05g2-B：东梯顶新链——P2 驻东（fb 杆1）后缝跳西上，razor 接力越顶（墙柱三槽32px，角色69.4px不可穿）
  waitP2Rest("等P2驻东(fb杆1已翻)"),
  S2p.holdGo(P.w6x2_pos, 3, "W6x' 驻位(站定)"),
  S2p.razorJump("left", 8, 30, "W6x' razor缝跳 东512西上P2东"),
  // r05g2: 旧门控 y>390 永假（P2顶417，站位 core=383.7——链卡死于此，wg 假冻 735.4），改 370-400
  S2p.wait((c) => c.me.grounded && c.me.y < 400 && c.me.y > 370 && c.me.x > 650 && c.me.x < 760, "P2东落定"),
  stanceWalk(712, "W6y驻位(纯左行门控)"),
  S2p.razorJump("right", P.w6y_drift, 40, "W6y 站跳右漂越楔上东320"),
  S2p.wait((c) => c.me.grounded && c.me.y < 375 && c.me.y > 260 && c.me.x > 760, "东320落定"),
  S2p.holdGo(P.j9w_pos, 30, "J9w跑道"),
  S2p.runJump("left", P.j9w_line, 30, "J9w 长助跑西越顶中心块", 7),
  S2p.wait((c) => c.me.grounded && c.me.y < 280 && c.me.x > 518, "中心块落定"),
  // 出口
  S2p.holdGo(P.gem640, 20, "蓝钻·中心块(672,192)"),
  // r05g2: W9 需全速起跳（vx0≈0 时空中漂移仅 74px，顶点 (486,100) 撞 b33 东尖坡面 (448,128)→(480,142) 弹落 P1 西；
  //   旧 goTo(578,20) 刹停后仅 ~2px 助跑）——改纯西行门控 640 保速，560 线起跳 vx0≈270px/s 漂 ~148px 落板东端
  { name: "W9跑道(纯西行门控)", run: (c) => (c.me.grounded && c.me.x > 640 ? { ...NONE, left: true } : NONE), done: (c) => c.me.grounded && c.me.x <= 640 },
  S2p.runJump("left", P.w9_line, 30, "W9 中心块→西走道"),
  S2p.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x < 470, "走道落定"),
  // r05g2-E W10 终版（西区全貌+滑轮遥测定案）：@416/@544 檐板 [224,384] 是封闭袋（西=毒池 b31、东=脊墙 352-384、
  //   上=走道板覆盖），井筒直落只有毒池（三次坠池实证）；b3 滑轮车是唯一 Entry。滑轮纯重力联动无棘轮：
  //   fb 压 b2 下行 → 车升至走道层(~118)；fb 离车即回沉。故 fb_b2wait 让 fb 延迟登车，wg 碰头跳落上【上升中】的车，
  //   车顶过 @416 台高窗(core≤437 即车顶≤470)瞬间东跳上台。跳低半档也会直落 @544 门台，done 双带兼容。
  { name: "走道西端门控", run: (c) => (c.me.grounded && c.me.x > 205 ? { ...NONE, left: true } : NONE), done: (c) => c.me.grounded && c.me.x <= 205 },
  S2p.holdGo(205, 6, "井口缓驻"),
  // 缘角步行必"慢滚+snap西射"(两次实测坠底)——顶棚碰头跳西越缘：跳1.1f碰天花板(64)归零vy，西漂~51px 落 x~160 ∈ 车带[98,190]
  S2p.razorJump("left", 1, 18, "碰头跳西越缘落滑轮车"),
  { name: "车顶落定", run: () => NONE,
    done: (c) => c.me.grounded && c.me.y > 100 && c.me.y < 560 && c.me.x > 98 && c.me.x < 200 },
  // r05g2: 车顶东跳穿隙直落 @544——@416/@544 甲板 x 带 [224,384] 重叠，台上跳永回原台；唯一通路是穿过两层甲板间
  //   的 96px 竖缝 (448,544)。三轮实测定参：跳升量 ~124px、vy 绝对 −474、漂移 cap ~4.06px/f——
  //   弧顶 = takeoff−124：[450,505] 窗弧顶 326 越过 @416 顶面后脚落 416 台面(实证)；[560,610] 窗弧顶 438 小圆
  //   恰在 @416 面带 [416,448] 内切磨 vx 278→0(实证)。终窗 core∈[590,630]：弧顶 466-506 从 @416 底(448)下穿、
  //   越面线后脚落 @544 x≈263-280 ∈ 门区。升降两相皆可触发（双稳）。
  { name: "车顶东跳落@544", ...(function () { let jumped = false, t = 0, air = false; return {
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded && c.me.y >= 612 && c.me.y <= 628) { jumped = true; t = 0; return { ...NONE, up: true, right: true }; }
          return NONE;
        }
        t++;
        if (t <= 40) return { ...NONE, right: true };
        return NONE;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    }; })() },
  // 落定：@544(站core 510.7) 或 @416(382.7) 双带兼容
  { name: "@416/544落定", run: () => NONE,
    done: (c) => c.me.grounded && c.me.x > 226 && c.me.x < 344 && ((c.me.y > 340 && c.me.y < 460) || (c.me.y > 460 && c.me.y < 560)) },
  // @416 分支：西行收钻(240,416 取放带 [240,304]x[352,416]——b20 悬浮柱与带重叠=关卡设计自证非实体)；已在 @544 则跳过
  { name: "西行收钻·@416", run: (c) => (c.me.y < 460 && c.me.grounded && c.me.x > 250 ? { ...NONE, left: true } : NONE),
    done: (c) => c.me.y > 460 || c.me.x <= 254 },
  // 西缘直跳+东tap2f 微漂(+4~6px)：起跳 core~254(大圆东缘263<柱西面261±) 落 core~258-262(大圆西缘 236-240 ≥224)
  S2p.razorJump("right", 2, 2, "西缘微跳落@544"),
  { name: "@544檐板落定", run: () => NONE,
    done: (c) => c.me.grounded && c.me.y > 460 && c.me.y < 560 && c.me.x > 226 && c.me.x < 340 },
  S2p.holdGo(300, 30, "东行wg门带(宽公差)"),
  S2p.sleep(500, "驻门WIN"),
];

const w = makeWorld("forest_05");
const mechLog = [];
const traceJ3 = args.includes("--trace-j3");
const r = drive(w, { fb, wg }, TOTAL, {
  logSteps: true, traceAll: true,
  onFrame: (f) => {
    if (traceJ3 && ((f >= 1170 && f <= 1290))) {
      const b = w.snapshotPlayer("fireboy");
      const g = w.snapshotPlayer("watergirl");
      const lv = w.mechanisms.levers.map((l) => l.state).join(",");
      console.log(`[j3] f${f} fb=(${b.x.toFixed(1)},${b.y.toFixed(1)}) wg=(${g.x.toFixed(1)},${g.y.toFixed(1)}) lev=${lv}`);
    }
    if (f % 30 !== 0) return;
    const m = w.mechSnapshot();
    const st = w.mechanisms.levers.map((l) => l.state).join(",");
    const pu = w.mechanisms.pulleys[0] ?? w.mechanisms.pulleys;
    const c1 = pu.plat1.GetPosition(), c2 = pu.plat2.GetPosition();
    const sig = `${m.platforms.map((p) => p.x.toFixed(0)).join("/")}|${st}|${c1.x.toFixed(1)},${c1.y.toFixed(1)}|${c2.x.toFixed(1)},${c2.y.toFixed(1)}`;
    if (mechLog.length && mechLog[mechLog.length - 1].sig === sig) return;
    mechLog.push({ f, sig });
    const pys = w.mechanisms.levers ? "" : "";
    const plats = w.mechanisms.platforms ?? w.mechanisms.movingPlatforms;
    const py = Array.isArray(plats) ? plats.map((p) => (p.body ? p.body.GetPosition().y.toFixed(0) : (p.GetPosition ? p.GetPosition().y.toFixed(0) : "?"))).join("/") : "?";
    console.log(`[mech] f${f} P=${m.platforms.map((p) => p.x.toFixed(0)).join("/")} Py=${py} levers=${st} car1=(${(c1.x * 100).toFixed(0)},${(c1.y * 100).toFixed(0)}) car2=(${(c2.x * 100).toFixed(0)},${(c2.y * 100).toFixed(0)})`);
  },
});
writeFileSync(fileURLToPath(new URL("./trace8.json", import.meta.url)), JSON.stringify(r.trace));
console.log("result:", JSON.stringify(r.result));
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log(`final fb=(${fbS.x.toFixed(1)},${fbS.y.toFixed(1)}) wg=(${wgS.x.toFixed(1)},${wgS.y.toFixed(1)}) phase=${w.phase} fbDoor=${fbS.doorFrame}/${fbS.atDoor} wgDoor=${wgS.doorFrame}/${wgS.atDoor}`);
console.log(`gems fb=${w.players.fireboy.diamonds} wg=${w.players.watergirl.diamonds}`);
const out = argOf("out", "");
if (out && r.result.won) {
  const doc = toRouteDoc("forest_05", r.events, Math.min(TOTAL, (r.result.winF ?? TOTAL) + 3), "r05g bot8 P3摆渡全线(W3'=oracle东缝跳)");
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log("route →", out, "fb/wg 事件:", doc.fb.length, doc.wg.length);
}

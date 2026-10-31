// probe28（fw-route-crystal2 槽）：C3 接地重同步 + C4 盒作业按 probe5c 实证序修正。
// probe27 证结（log 逐帧）：
//  (1) C3 焰失败根因：variant-J 末级 jd55 在空中(f1045 触发于 (200,700) 短暂触地)发射 → 顶点 (84,604)
//      偏东，西漂余量在墙钉 x40 处耗尽（中心未过 38）→ 不触发。probe16d 成功弧为 接地(132,701) 触地
//      即跳（vx≈-150），顶点 (70,594)，顶点后 -190px/s 西漂 10f 内中心过 38 触发。
//      修法：jd55 前插 landAt(136) 接地重同步步，恢复 probe16d 触地即跳弹道。
//  (2) P1 慢速步行穿越亦触发（probe27 f3003 步行入 P1 东端即传）→ 传送门槛是「中心过板中心线±6」
//      而非高速；probe25/26/27 全败均因中心只到 40（墙钉）从未 ≤38。
//  (3) nook 结构（probe17-geom dump x[-40,130]）：板传感 [28.8,35.2]×[576,672]（中心线 x32），
//      区域 [-32,96]×[576,672]，墙钉中心 ~40。
//  (4) probe21 fb C4 下行段全实证：TP 落 (1206,94) → 西爬阶梯(脚192)→高板(脚127)→唇口蠕落→
//      口袋平 (643,221)→堆顶→阳台 (767,381)→东斜→row-19 (851,573)。
//  (5) probe21 fb 停 (750,541) 720f：柱 [706,734] 延伸挡 row-18 —— 盒链锁存必须先行。
//  (7) probe28 再证：jd55 重同步弧仍只到中心 40（柱顶角(32,672)搁住），差 2px 不触发；
//      且 P1 慢速步行即触发 → 触发条件=中心过 38（板中线 32+6）+ y 带【与速度无关】。
//      新 C3：走道平坦 491→60 全程 y736，蠕行至柱东面 60 → jumpOnto(-1,620) 原地跳西漂越
//      柱顶：中心在带内(y~615)过 38 → 必触发（probe3-C 慢速挤压同构）。弃 jd55 弧。
//  (6) C4 盒作业按 probe5c 实证序（browser 实机）：箱原位 (960,290) 在 320 层甲板；
//      fb P4 穿越上传甲板 (1209,304) → 西行 900（箱西侧）→ 东推箱入 P5 狭缝（fb 停 ~1145 安全区，
//      箱 TP 西抛落 row-19 ~1205.7）→ fb 跟进 P5→P4 西抛落 row-19 → 东贴箱东面 → 西推箱上板 976
//      → 锁存 → 柱收起。probe27 缺「上传甲板+东推箱」两步，序全错，故重写。
import { makeWorld } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs";
import { NONE, S } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/botcore.mjs";

const ds = (d) => (d > 0 ? "right" : "left");
const UPW = 25;
const wrapTap = (stp) => { const orig = stp.run.bind(stp); let jAt = -1, airAfter = false;
  stp.run = (ctx) => { if (ctx.f <= 1) return NONE;
    const inp = orig(ctx) || NONE;
    if (inp.up) { jAt = ctx.f; }
    else if (jAt >= 0 && ctx.f <= jAt + UPW - 1) { inp.up = true; }
    if (jAt >= 0 && !ctx.me.grounded) airAfter = true;
    return inp; };
  stp.done = (c) => jAt >= 0 && airAfter && c.me.grounded && c.me.vy >= -8;
  return stp; };
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
  push: (dir, untilX, propId = 0) => {
    const D = dir > 0 ? "right" : "left";
    return {
      name: `push${dir}->${untilX}`,
      run: () => ({ ...NONE, [D]: true }),
      done: (c) => {
        const px = c.w.mechSnapshot().props[propId].x;
        return dir > 0 ? px >= untilX : px <= untilX;
      },
    };
  },
  // 接地重同步：等 grounded 且 x∈[xMin,xMax]（触地即过，保留触地残余 vx —— probe16d 触地即跳弹道）
  landAt: (xMax, xMin = 96) => {
    const L = "left", R = "right";
    return {
      name: `landAt${xMax}`,
      run: (c) => {
        if (!c.me.grounded) return NONE;
        if (c.me.x > xMax) return Math.abs(c.me.vx) > 90 ? NONE : { ...NONE, [L]: true };
        if (c.me.x < xMin) return { ...NONE, [R]: true };
        return Math.abs(c.me.vx) > 160 ? NONE : { ...NONE, [L]: true };
      },
      done: (c) => c.me.grounded && c.me.x <= xMax && c.me.x >= xMin && Math.abs(c.me.vx) <= 160,
    };
  },
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
const spec = (n, ...a) => ({ n, a });
const stepOf = (sp) => PRIM[sp.n](...sp.a);
PRIM.holdTp = (d, xLine, yLine, down) => { const D = d > 0 ? "right" : "left";
  return { name: `holdTp${xLine}`, run: () => ({ ...NONE, [D]: true }),
    done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) || (down ? c.me.y >= yLine : c.me.y <= yLine) }; };
PRIM.hopTp = (d, xLine, yLine, down) => ({ name: `hTp${xLine}`,
  run: (c) => { const st = c.mem; const D = d > 0 ? "right" : "left"; const t = (st.t = (st.t ?? 0) + 1); const ph = t % 80;
    if (st.air) { if (c.me.grounded && c.me.vy >= -8) { st.air = false; st.j = false; st.t = 0; return NONE; } return { ...NONE, [D]: true }; }   // 落地清 air/j/t 重启周期（v14 实锤：air 锁存不清 → 永久 NONE 钉死 1073）
    if (ph <= 30) return { ...NONE, [D]: true };                // 东压推进
    if (ph <= 68) return NONE;                                  // 立定（行走态起跳被拒，站定后 up 边沿才触发）
    if (!st.j) { if (c.me.grounded) { st.j = true; return { ...NONE, [D]: true, up: true }; } return NONE; }
    if (!c.me.grounded) { st.air = true; return { ...NONE, [D]: true }; }
    return { ...NONE, [D]: true };
  },
  done: (c) => (d > 0 ? c.me.x >= xLine : c.me.x <= xLine) || (down ? c.me.y >= yLine : c.me.y <= yLine) });
PRIM.hopOnce = (xT, driftF) => ({ name: `hop1${xT}`,
  run: (c) => { const st = c.mem; const t = (st.t = (st.t ?? 0) + 1);
    if (st.air) { if (c.me.grounded && c.me.vy >= -8) { st.air = false; st.j = false; st.t = 0; return NONE; } return c.me.x <= xT - 25 ? NONE : { ...NONE, left: true }; }   // 落地清 air/j/t；空中过线 xT-25=910 停漂（冲距 ~33px → 落 ~877：甲板上、箱西面 896 之西、西缘 840 之东；v16=949 落箱顶/ v17=880 落西缘外楼梯）
    if (t <= (driftF ?? 16)) return NONE;                       // 立定静置（长度=driftF 参数复用；行走中起跳被拒，站定后 up 边沿才触发）
    if (!st.j) { if (c.me.grounded) { st.j = true; if ((c.f % 1) === 0) console.log(`EDGE f${c.f} settle=${(driftF ?? 16)} x=${c.me.x.toFixed(1)}`); return { ...NONE, left: true, up: true }; } return NONE; }
    if (!c.me.grounded) { st.air = true; return { ...NONE, left: true }; }
    return t > 35 + (driftF ?? 16) ? NONE : { ...NONE, left: true };
  },
  done: (c) => (c.me.x <= xT && c.me.grounded && c.me.vy >= -8) || !!(c.mem.j && c.mem.air && c.me.grounded && c.me.vy >= -8) || !!(c.mem.j && (c.mem.t ?? 0) > 35 + (driftF ?? 16) + 40) });
PRIM.edgeJumpW = (holdF) => ({ name: `edgeW${holdF}`,
  run: (c) => { const st = c.mem; const t = (st.t = (st.t ?? 0) + 1);
    if (t === 1) { console.log(`EDGEW f${c.f} x=${c.me.x.toFixed(1)} y=${c.me.y.toFixed(1)}`); return { ...NONE, up: true, left: true }; }
    if (t <= 1 + (holdF ?? 120)) return { ...NONE, left: true };
    return NONE;
  },
  done: (c) => c.me.grounded && c.me.vy >= -8 && c.me.x <= 745 });

const jd40 = spec("jumpDrift", -1, 0, 40);
// C3 v4：走道平直蠕行至 60（柱 [0,32]x[672,768] 东面停 46.4 前）→ jumpOnto 原地跳西漂越柱顶，
// 中心于 y 带 [540.8,707.2] 内过 38 → P3→P2 触发；attempt2 东归 260 后同法冗余。
const C3VJ = [
  spec("walkTo", -1, 70, 60), spec("jumpOnto", -1, 700), spec("sleep", 60),
  spec("walkTo", 1, 260, 60), spec("walkTo", -1, 70, 60), spec("jumpOnto", -1, 700), spec("sleep", 60),
];
const PROG = {
  wg: [
    spec("sleep", 3), jd40, jd40, jd40, jd40, jd40, jd40, jd40, spec("sleep", 40),   // C0
    spec("hold", -1, 500), spec("sleep", 15),                                         // C1
    spec("hold", 1, 565), spec("sleep", 20),                                          // C2
    spec("hold", 1, 575), spec("runJump", -1, 535, 25), spec("hold", -1, 300), jd40, jd40, jd40, spec("jumpDrift", -1, 0, 55), spec("sleep", 40), // C3 = probe16d wg 原文
    // 环 9 下行（probe21 fb 实证段）→ 等 fb 盒锁存后再走柱下通道
    spec("sleep", 200),                         // fb 已先行（probe41 预算）
    spec("walkTo", -1, 620, 60),                // 蠕行：楼梯攀→高板→唇口蠕落→口袋平
    spec("walkTo", 1, 700, 60),                 // 口袋→东斜下→堆顶
    spec("walkTo", 1, 845, 60),                 // 阳台→东斜→降 row-19 (~851)
    spec("sleep", 250),                         // 等 fb 锁存完成、柱收起
    // 环 11：柱下通道（柱已收）
    // 环 11 改道：row-19 东返 P4 上甲板 → 越箱 → 西缘跳越柱（盒锁存不可行，双角色同路错峰）
    spec("walkTo", 1, 1200, 90),                // row-19 东行至 P4 区
    spec("hopTp", 1, 1233, 320, 0),             // 穿 P4 → TP 上甲板 (1203,285)
    spec("sleep", 30),
    spec("hopOnce", 935, 38),
    spec("sleep", 10),
    spec("hopOnce", 935, 55),
    spec("sleep", 10),
    spec("hopOnce", 935, 80),
    spec("sleep", 10),
    spec("hopOnce", 935, 120),
    spec("walkTo", -1, 856, 60),                // 甲板西缘站位
    spec("sleep", 15),
    spec("edgeJumpW", 120),                     // 跳越柱顶落台面西段
    spec("sleep", 60),
    // 环 12 改道 v22：袋板西行 → 跳塔 → 袋底西行直入己门带 [64,128]×[256,264]（fb 门带对 wg 无效直穿）
    spec("walkTo", -1, 568, 120),               // 楔坡顶起跳位（同 fb）
    spec("sleep", 20),
    spec("jumpDrift", -1, 0, 90),               // 长压西越塔顶：贴墙段无漂移，唯 feet<128 窗口(~16f)产生漂移，须压满弧线
    spec("sleep", 60),
    spec("walkTo", -1, 96, 90),                 // 西行入己门带中心 96 ∈ [64,128]（若落塔顶则走离西缘落袋底续行）
    spec("sleep", 600),                         // 驻留门带 → isUp

  ],
  fb: [
    spec("sleep", 220),                                                          // 错峰（probe6e）
    spec("sleep", 3), jd40, jd40, jd40, jd40, jd40, jd40, jd40, spec("sleep", 40),   // C0
    spec("hold", -1, 420), spec("sleep", 15),                                    // C1
    spec("hold", 1, 488), spec("sleep", 40),                                     // C2
    spec("sleep", 120), jd40, spec("jumpDrift", -1, 0, 32), jd40, spec("jumpDrift", -1, 0, 55), spec("sleep", 40), // C3 = probe16d fb 原文（f1092 触发）
    // 环 9 下行（probe21 实证）→ 环 10 盒作业（probe5c 实证序）
    spec("sleep", 30),
    spec("walkTo", -1, 620, 60),                // 楼梯攀→高板→唇口蠕落→口袋平
    spec("walkTo", 1, 700, 60),                 // 堆顶
    spec("walkTo", 1, 845, 60),                 // 阳台→东斜→row-19 (~851)
    spec("hopTp", 1, 1233, 320, 0),             // 东压+立定跳循环穿 P4（TP 甲板 y≤320 即成）
    spec("hopOnce", 935, 38),                   // 西向跳越箱顶（v18 实证 4 跳落 860，box 止于 925 无碍）
    spec("sleep", 10),
    spec("hopOnce", 935, 55),
    spec("sleep", 10),
    spec("hopOnce", 935, 80),
    spec("sleep", 10),
    spec("hopOnce", 935, 120),
    spec("walkTo", -1, 856, 60),                // 西行至甲板真缘站位（v18 实证 860 站立、850 已滑）
    spec("sleep", 15),                          // 立定清 prohibit（行走态起跳被拒）
    spec("edgeJumpW", 120),                     // 西跃下缘：弧越楼梯(810-834)与柱顶(480)，落台面 ~640-660（柱之西）
    spec("sleep", 60),                          // 落定
    // 环 11/12（柱已收）
    spec("walkTo", -1, 568, 120),               // 袋板西行上楔坡顶(608-576, 256→224；45°斜 n.y≈0.71>0.65 全跳)——勿越 566（东侧台阶可攀入死台）
    spec("sleep", 20),                          // 立定清 prohibit
    spec("jumpDrift", -1, 0, 90),               // 长压西跳：v23 实证 apex feet≈106>塔顶128 但 40f 压满于自由窗开启前 → 回落死台；90f 覆盖全程
    spec("sleep", 60),                          // 落定
    spec("walkTo", -1, 455, 60),                // 西行入 fb 门带 [416,480]×[256,264]
    spec("walkTo", 1, 450, 60),                 // 带心回正（防过冲出带）
    spec("sleep", 400),                         // 驻留门带：isOpen 25fps 推进 frac→21 → isUp（需与 wg 同窗到位）

  ],
};
const SEGBOUNDS = { fb: [9, 11, 13, 20, 40, 41], wg: [9, 11, 13, 21, 33, 38] };
const segTag = (role, i) => {
  const b = SEGBOUNDS[role];
  return i <= b[0] ? "C0" : i <= b[1] ? "C1" : i <= b[2] ? "C2" : i <= b[3] ? "C3" : i <= b[4] ? "C4" : "C5";
};

const w = makeWorld("crystal_03");
const progs = { fb: PROG.fb.map(stepOf), wg: PROG.wg.map(stepOf) };
const WGSX = Number(process.env.WGSX ?? 70);
const WGWAIT = Number(process.env.WGWAIT ?? 1300);
const WGTOTAL = Number(process.env.WGTOTAL ?? 8400);
{
  const insW = [];
  if (WGWAIT > 0) insW.push(stepOf({ n: "sleep", a: [WGWAIT] }));
  insW.push(stepOf({ n: "walkTo", a: [1, WGSX + 120, 60] }));
  insW.push(stepOf({ n: "walkTo", a: [-1, WGSX, 60] }));
  insW.push(stepOf({ n: "jumpOnto", a: [-1, 700] }));
  progs.wg.splice(21, 0, ...insW);   // wg C0-C3（probe16d 原文，无 sleep600）共 21 步
}
const idx = { fb: 0, wg: 0 };
const state = { fb: { ...NONE }, wg: { ...NONE } };
const snapOf = (role) => {
  const s = w.snapshotPlayer(role);
  return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: w.players[role].feetContacts.length > 0, dead: s.dead || s.dying, atDoor: s.atDoor };
};
const prev = { fb: null, wg: null, box: null };
const TOTAL = WGTOTAL;
let f = 0;
let progSum = 0, progAt = 0;
for (f = 0; f < TOTAL; f++) {
  const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
  for (const role of ["fb", "wg"]) {
    NONE.up = false; NONE.left = false; NONE.right = false;   // 帧首重置共享 NONE（wrapTap 窗口期突变残留根治；本帧本角色后续注入仍生效）
    const stp = progs[role][idx[role]];
    if (!stp) continue;
    const ctx = { f, w, me: meS[role], other: meS[role === "fb" ? "wg" : "fb"], mem: (stp._mem ??= {}), jumpHeld: state[role].up };
    let inp = null;
    try { inp = stp.run(ctx); } catch { inp = NONE; }
    const next = { up: !!(inp?.up), left: !!(inp?.left), right: !!(inp?.right) };
    state[role] = next;
    let d = false;
    try { d = stp.done(ctx); } catch { d = false; }
    if (d) idx[role]++;
  }
  if (idx.fb + idx.wg !== progSum) { progSum = idx.fb + idx.wg; progAt = f; }
  if (f - progAt > 2600) { console.log("ABORT stuck-no-progress since f" + progAt); break; }
  w.step(1 / 60, { fireboy: state.fb, watergirl: state.wg });
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  const M = w.mechSnapshot();
  const box = M.props[0];
  const tp = [];
  const chk = (tag, cur, prv) => { if (prv && Math.hypot(cur.x - prv.x, cur.y - prv.y) > 80) tp.push(`${tag}:${prv.x.toFixed(0)},${prv.y.toFixed(0)}→${cur.x.toFixed(0)},${cur.y.toFixed(0)}`); };
  chk("fb", a, prev.fb); chk("wg", b, prev.wg); chk("box", box, prev.box);
  prev.fb = { x: a.x, y: a.y }; prev.wg = { x: b.x, y: b.y }; prev.box = { x: box.x, y: box.y };
  const doors = w.doors;
  if (f % 20 === 0 || tp.length || a.dead || a.dying || b.dead || b.dying || w.phase === "won") {
    console.log(`f${String(f).padStart(4)} [fb${segTag("fb", idx.fb)}/${idx.fb} wg${segTag("wg", idx.wg)}/${idx.wg}] fb[${a.x.toFixed(0)},${a.y.toFixed(0)},g${w.players.fireboy.feetContacts.length > 0 ? 1 : 0},d${a.atDoor ? 1 : 0}] wg[${b.x.toFixed(0)},${b.y.toFixed(0)},g${w.players.watergirl.feetContacts.length > 0 ? 1 : 0},d${b.atDoor ? 1 : 0}] box[${box.x.toFixed(0)},${box.y.toFixed(0)}] plat[y${M.platforms[0].y.toFixed(0)},st${M.platforms[0].state}] push[st${M.pushers[0].state}] doorUp[${doors.fireboy.isUp ? 1 : 0},${doors.watergirl.isUp ? 1 : 0}]${tp.length ? " TP:" + tp.join(" | ") : ""}${a.dead || a.dying ? " FB-DEAD" : ""}${b.dead || b.dying ? " WG-DEAD" : ""}${w.phase === "won" ? " *** WON ***" : ""}`);
  }
  if (a.dead || a.dying || b.dead || b.dying || w.phase === "won") break;
}
console.log(`\nEND f=${f} idx fb=${idx.fb}/${progs.fb.length} wg=${idx.wg}/${progs.wg.length} won=${w.phase === "won"}`);

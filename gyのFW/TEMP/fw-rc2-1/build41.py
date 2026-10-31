import sys
src = open('probe30.mjs').read()

# 0. NONE 防突变冻结：wrapTap/prim 若将 up 写入共享 NONE 对象（module 级单例），
#    此后所有 {...NONE} 展开携带 up:true，prohibitJump 永不清零、跳跃全拒。
#    ESM 严格模式下冻结后赋值抛 TypeError，被 harness catch 吞掉，输入保持纯净。
old_imp = "} from \"/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/botcore.mjs\";"
assert old_imp in src, 'imp anchor'
# （freeze 方案弃用：会改变已证下降轨迹；改为每帧帧首重置 NONE，见 driver 补丁）

# 1. wg 头删 sleep600（probe16d/probe21 的 wg 立即起跑，fb sleep220 错峰；保 f202/f429/f1092 确定性）
old_h = '    spec("sleep", 600),                                                              // 错峰：C3 独占西驱道（probe21/22 实证）\n'
assert old_h in src, 'head anchor'
src = src.replace(old_h, '', 1)

# 2. wg C3: sleep570 + jumpOnto-chain -> probe16d wg C3 原文（f1092 前勿改；起跳段由 env 注入）
old_wg = '    spec("sleep", 570),                         // 等 fb C3 TP 清道（错峰须在 C2 后）\n    ...C3VJ,\n'
new_wg = '    spec("hold", 1, 575), spec("runJump", -1, 535, 25), spec("hold", -1, 300), jd40, jd40, jd40, spec("jumpDrift", -1, 0, 55), spec("sleep", 40), // C3 = probe16d wg 原文\n'
assert old_wg in src, 'wg anchor'
src = src.replace(old_wg, new_wg, 1)

# 3. wg tail: sleep500 -> 200
old_sl = '    spec("sleep", 500),                         // 等 fb 盒作业推进（时序预算见文件头）\n'
assert old_sl in src, 'sl anchor'
src = src.replace(old_sl, '    spec("sleep", 200),                         // fb 已先行（probe41 预算）\n', 1)

# 4. fb C3: jumpOnto-chain -> probe16d fb C3 jd-chain 原文（f1092 触发）
old_fb = '    ...C3VJ,\n'
assert old_fb in src, 'fb anchor'
src = src.replace(old_fb, '    spec("sleep", 120), jd40, spec("jumpDrift", -1, 0, 32), jd40, spec("jumpDrift", -1, 0, 55), spec("sleep", 40), // C3 = probe16d fb 原文（f1092 触发）\n', 1)
assert old_fb not in src, 'fb leftover'

# 5. holdTp prim（TP 后 1233 不可达，以 y 阈值判成）——插在 stepOf 定义后、progs 构建前
old_sof = 'const stepOf = (sp) => PRIM[sp.n](...sp.a);\n'
assert old_sof in src, 'stepOf anchor'
src = src.replace(old_sof, old_sof + '''PRIM.holdTp = (d, xLine, yLine, down) => { const D = d > 0 ? "right" : "left";
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
''', 1)

# 5b. v20 方案：盒链锁存整体作废（mini-geom 实证：箱西 895 台阶箱不可越/portal 只传 pers/P5 出口静止 1209）→
#     双角色均走「P4 上甲板 → hopOnce 越箱（v18 实证落 860）→ 甲板西缘 edgeJumpW 跳越柱顶落台面西段（mini-col18 v3 几何）」。
old_w9 = '    spec("walkTo", -1, 900, 60),                // 甲板西行至箱 (960) 西侧（过箱略推西无妨）\n'
assert old_w9 in src, 'w9 anchor'
src = src.replace(old_w9, '''    spec("hopOnce", 935, 38),                   // 西向跳越箱顶（v18 实证 4 跳落 860，box 止于 925 无碍）
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
''', 1)
# v19：删除 P5 推箱 + fb 跟进 P5 + 二次西推段（ portal 不传箱，P5 路线作废；箱已随上块坠缘+上板）
old_del = '''    spec("push", 1, 1175),                      // 东推箱入 P5 狭缝 → 箱 TP 西抛落 row-19
    spec("sleep", 60),                          // 箱飞行/落定
    spec("hold", 1, 1233),                      // fb 跟进 P5 → P4 西抛落 row-19
    spec("sleep", 60),                          // 落定
    spec("walkTo", 1, 1200, 60),                // 东贴保位（箱东面上位）
    spec("push", -1, 970),                      // 西推箱上板 976 → 锁存 → 柱收起
    spec("sleep", 60),
'''
assert old_del in src, 'del anchor'
src = src.replace(old_del, '', 1)

# 5c. env 参数化 wg 起跳段：[sleep(WGWAIT), walkTo(1,SX+120), walkTo(-1,SX), jumpOnto(-1,700)]
#    （probe30 实证刮檐触发；120px 西向助跑使起跳 vx≈-4.5 —— 20px 短助跑 vx≈-3 差 2px 不过线）
old_progs = 'const progs = { fb: PROG.fb.map(stepOf), wg: PROG.wg.map(stepOf) };\n'
assert old_progs in src, 'progs anchor'
ins = '''const progs = { fb: PROG.fb.map(stepOf), wg: PROG.wg.map(stepOf) };
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
'''
src = src.replace(old_progs, ins, 1)

# 5b. fb 两个 hold(1,1233) -> holdTp（TP 后 1233 不可达，以 y 阈值判成）
old_h1 = '    spec("hold", 1, 1233),                      // row-19 东行穿 P4 区 → TP 上传甲板 (~1209,304)\n'
assert old_h1 in src, 'h1 anchor'
src = src.replace(old_h1, '    spec("hopTp", 1, 1233, 320, 0),             // 东压+立定跳循环穿 P4（TP 甲板 y≤320 即成）\n', 1)

# 6. TOTAL -> env；卡死中止
old_loop = 'const prev = { fb: null, wg: null, box: null };\nconst TOTAL = 6400;\nlet f = 0;\n'
assert old_loop in src, 'loop anchor'
src = src.replace(old_loop, 'const prev = { fb: null, wg: null, box: null };\nconst TOTAL = WGTOTAL;\nlet f = 0;\nlet progSum = 0, progAt = 0;\n', 1)
old_inc = '    if (d) idx[role]++;\n  }\n'
assert old_inc in src, 'inc anchor'
src = src.replace(old_inc, '    if (d) idx[role]++;\n  }\n  if (idx.fb + idx.wg !== progSum) { progSum = idx.fb + idx.wg; progAt = f; }\n  if (f - progAt > 2600) { console.log("ABORT stuck-no-progress since f" + progAt); break; }\n', 1)
# 7. 帧首重置共享 NONE（根治 wrapTap 窗口期突变污染：NONE.up 残留 → prohibitJump 永不清零 → 跳全拒）
old_role = '  for (const role of ["fb", "wg"]) {\n    const stp = progs[role][idx[role]];'
assert old_role in src, 'role anchor'
src = src.replace(old_role, '  for (const role of ["fb", "wg"]) {\n    NONE.up = false; NONE.left = false; NONE.right = false;   // 帧首重置共享 NONE（wrapTap 窗口期突变残留根治；本帧本角色后续注入仍生效）\n    const stp = progs[role][idx[role]];', 1)

# 5d. v20 尾段改道：fb 删旧柱下通道两步；wg 柱下通道 → row-19 东返 P4 上甲板 → 越箱 → 西缘跳越柱（镜像 fb 错峰）
old_fbtail = '''    spec("walkTo", -1, 820, 60),
    spec("jumpDrift", -1, 0, 10),
    spec("walkTo", -1, 210, 90),'''
assert old_fbtail in src, 'fb tail anchor'
src = src.replace(old_fbtail, '''    spec("walkTo", -1, 210, 90),                // 台面西段（edgeJumpW 已落柱西，无需柱下通道）''', 1)

old_wgtail = '''    spec("walkTo", -1, 820, 60),
    spec("jumpDrift", -1, 0, 10),               // 跳上 row-18
    // 环 12：西段
    spec("walkTo", -1, 210, 90),'''
assert old_wgtail in src, 'wg tail anchor'
new_wgtail = '''    // 环 11 改道：row-19 东返 P4 上甲板 → 越箱 → 西缘跳越柱（盒锁存不可行，双角色同路错峰）
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
    // 环 12：西段
    spec("walkTo", -1, 210, 90),'''
src = src.replace(old_wgtail, new_wgtail, 1)

# 5e. v21 门停泊修正：fb 门体 448（mini-doors 实证）—— walkTo(1,470) 在 P6 落点 560 即刻 done 从未西行 → 改西行 452 入门区；
#     wg 门体 96 —— v20 实证 edgeJumpW 落 (681,259) 后自然攀经口袋 (624,221) 上门台 (560,169)，walkTo(-1,210) 目标在唇口墙外永不成 → 改 walkTo(-1,566) 上台即成，弃 P6（runJump/hold(-1,86) 原文续行）。
old_fbpark = '    spec("walkTo", 1, 470, 60),                 // 停门区东侧 (wg 泊 400)\n'
assert old_fbpark in src, 'fb park anchor'
src = src.replace(old_fbpark, '    spec("walkTo", -1, 452, 60),                // 西行入门区（门体 448，v20 实证 560 停泊不触门）\n', 1)

old_wgsec = '''    // 环 12：西段
    spec("walkTo", -1, 210, 90),
    spec("walkTo", -1, 55, 60),
    spec("sleep", 10),
    spec("jumpDrift", 1, 0, 40),                // 板跳上基座顶
    spec("sleep", 15),
    spec("hold", 1, 430),                       // P6 挤压 → TP 落门台
'''
assert old_wgsec in src, 'wg sec anchor'
new_wgsec = '''    // 环 12 改道：西行经口袋/唇口自然攀上门台（v20 实证 681→624→570→560），不经 P6
    spec("walkTo", -1, 566, 150),               // 上门台（556 处唇口墙，目标留 566 防卡死）
    spec("sleep", 30),
'''
src = src.replace(old_wgsec, new_wgsec, 1)

# 5f. v22 门带终段（mini-doors v4/v5 实证）：门 sensor 带 fb[416,480]×[256,264] / wg[64,128]×[256,264] 均在袋底地板
#     [0,512]×[256,288] 之上；塔 [512,544]×[160,256] 封袋西，台架 224 跳越塔顶(160,余量36px)落袋底即达 fb 门带；
#     wg 同路穿 fb 门带（sensor 角色过滤）直行己带。弃 P6/runJump/210/55 全段。
old_fbtail = '''    spec("walkTo", -1, 210, 90),                // 台面西段（edgeJumpW 已落柱西，无需柱下通道）
    spec("walkTo", -1, 55, 60),
    spec("sleep", 10),
    spec("jumpDrift", 1, 0, 40),
    spec("sleep", 15),
    spec("hold", 1, 430),                       // P6 挤压 → TP 落门台
    spec("walkTo", -1, 452, 60),                // 西行入门区（门体 448，v20 实证 560 停泊不触门）
    spec("sleep", 400),'''
assert old_fbtail in src, 'fb v22 anchor'
new_fbtail = '''    spec("walkTo", -1, 568, 120),               // 袋板西行上楔坡顶(608-576, 256→224；45°斜 n.y≈0.71>0.65 全跳)——勿越 566（东侧台阶可攀入死台）
    spec("sleep", 20),                          // 立定清 prohibit
    spec("jumpDrift", -1, 0, 90),               // 长压西跳：v23 实证 apex feet≈106>塔顶128 但 40f 压满于自由窗开启前 → 回落死台；90f 覆盖全程
    spec("sleep", 60),                          // 落定
    spec("walkTo", -1, 455, 60),                // 西行入 fb 门带 [416,480]×[256,264]
    spec("walkTo", 1, 450, 60),                 // 带心回正（防过冲出带）
    spec("sleep", 400),                         // 驻留门带：isOpen 25fps 推进 frac→21 → isUp（需与 wg 同窗到位）
'''
src = src.replace(old_fbtail, new_fbtail, 1)

old_wgtail = '''    // 环 12 改道：西行经口袋/唇口自然攀上门台（v20 实证 681→624→570→560），不经 P6
    spec("walkTo", -1, 566, 150),               // 上门台（556 处唇口墙，目标留 566 防卡死）
    spec("sleep", 30),
    spec("walkTo", 1, 400, 60),                 // 东蠕至 400（fb 已泊 470）
    spec("sleep", 10),
    spec("runJump", -1, 400, 25),               // 跳越 P7 板 → 门台西段
    spec("hold", -1, 86),                       // 西门
    spec("sleep", 200),'''
assert old_wgtail in src, 'wg v22 anchor'
new_wgtail = '''    // 环 12 改道 v22：袋板西行 → 跳塔 → 袋底西行直入己门带 [64,128]×[256,264]（fb 门带对 wg 无效直穿）
    spec("walkTo", -1, 568, 120),               // 楔坡顶起跳位（同 fb）
    spec("sleep", 20),
    spec("jumpDrift", -1, 0, 90),               // 长压西越塔顶：贴墙段无漂移，唯 feet<128 窗口(~16f)产生漂移，须压满弧线
    spec("sleep", 60),
    spec("walkTo", -1, 96, 90),                 // 西行入己门带中心 96 ∈ [64,128]（若落塔顶则走离西缘落袋底续行）
    spec("sleep", 600),                         // 驻留门带 → isUp
'''
src = src.replace(old_wgtail, new_wgtail, 1)

open('probe41.mjs', 'w').write(src)



print('built probe41.mjs OK')

// forest_04 v17 — 结构重设计（r04, 接 07号档）:
//  A) fb 弃东游([19]/[15]/perch 全链): [45]走廊(416-544@576)西缘走落——fall 160px 持左漂~110px
//     落门块高原(296±10,736), walk-off 零时序刀; 消 fb perch 彩票/midSet 缘刀/nw 6px 裕全簇。
//  B) wg DFH 55→60: 弧线落 p1 顶面(contact 355-360) 而非东北角栖落; 落面后持左走 28px
//     出西缘再走落 64px 到高原——角彩票变"落面+走落"。nw 释放 475→500(停点裕 6→30+px)。
//  C) 保留: a2col 梯(mc150 零失败, 违禁链豁免——覆盖型梯子)、万能钉 pin 结构、其余 v15 全部。
// 关键修正（vs v6 的三处致命脆点, 全部经逐帧追踪证实）:
//  1) fb a2col: v6 在 A 顶"停稳后跳"是 3.5px 擦角跳板(顶点脚高 323.5 vs 台面 320),
//     A 高度受箱微滑混沌驱动 434~452 → 擦中/擦飞两难。v7: 首次 Ay<440 立即跳
//     (此时 A≈430-446, 顶点 296-311, 净空 9~24px), 满持右 50f 直落柱+shelf 连续台面(128-226)。
//  2) wg [32]坡出口: v6 固定帧 f368 松右是竞速——扰动下她全速(286)冲出坡端坠深谷绿水(f372 死)。
//     v7: 台面 x≤1064 处松右(条件自同步), 7v 比例刹车 τ0.14s 滑停于 ~1104(坡端 1120 前 16px),
//     停稳后 {right,up} 持右 13f 小跳, 漂 ~21px 落 [13] 干燥带(1120-1140, 避开绿水)。
//  3) fb 384台出口: v6 定点松键是双刃刀——过快(≥207px/s 越缘)漂 ≥30px 落 [115] 顶陷阱(733,480),
//     过慢停在台上则后续固定帧全速越缘同样死。v7: 行进中 x≤796 处起跳 {up}+同时松左
//     (速度被钳幅 vx≈237, 空气阻力 τ0.14 → 漂 ~35px), 落 (752-774,768) 竖井内 [19] 顶。
// 制动/阻力统一模型(实测): 无输入时 i.x=7·(-vx) → 指数衰减 τ≈0.14s, 地面/空中同;
// 跳跃: SetLinearVelocity, 平地 vy=-496, 总速钳 496 (中速行进跳 vy≈-435); 需脚接触 n.y>0.2。
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
// 门飞扫参: DF_REL/DF_PRE/DF_HOLD (wg), FB_REL/FB_PRE/FB_HOLD (fb) —— p1 切角擦掠(顶点切角工程)
const DFR = +(process.env.DF_REL || 465), DFP = +(process.env.DF_PRE || 0), DFH = +(process.env.DF_HOLD || 60);
const FBR = +(process.env.FB_REL || 465), FBP = +(process.env.FB_PRE || 0), FBH = +(process.env.FB_HOLD || 65);
let WGRES = "timeout";
const w = makeWorld("forest_04");
const NONE = { up: false, left: false, right: false };
const pul = w.mechanisms.pulleys[0], box = w.mechanisms.props[0];
const A = pul.plat1, B = pul.plat2;
const topOf = (b) => -b.GetPosition().y * 32 - 4.4;
let fbIn = { ...NONE }, wgIn = { ...NONE }, fbEv = [], wgEv = [];
let fbP = "walkA", wgP = "runPush";
const mark = {};
const setIn = (who, o, f) => {
  const cur = who === "fb" ? fbIn : wgIn, ev = who === "fb" ? fbEv : wgEv;
  for (const k of ["up", "left", "right"]) {
    const v = !!o[k];
    if (cur[k] !== v) { ev.push({ f, dir: k, type: v ? "down" : "up" }); cur[k] = v; }
  }
};
const say = (s, f) => { console.log(`f${f} ${s}`); };
let fbJump = -1, fbHoldA = 999;
for (let f = 0; f <= 2800; f++) {
  const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
  const fbF = fbS.y + 35.2, wgF = wgS.y + 35.2, Ay = topOf(A), By = topOf(B);
  const bx = -box.body.GetPosition().x * 32;

  // ============ fb ============
  if (fbP === "walkA") {
    if (f < 3) setIn("fb", {}, f); else setIn("fb", { left: true }, f);
    if (fbJump < 0 && fbS.x < 139) { fbJump = f + 1; fbHoldA = fbJump + 6; }
    if (fbJump > 0 && f === fbJump) setIn("fb", { left: true, up: true }, f);
    if (f === fbHoldA) setIn("fb", {}, f);
    if (f > fbHoldA + 8 && Math.abs(fbS.vy) < 6 && fbF < 890 && fbS.x < 124) { fbP = "ride"; say(`fb登A(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "ride") {
    // Ay<444 且贴板(|feet-Ay|<8, |vy|<50)→起跳梯子: 弹跳结束时刻混沌±14f,
    // 单固定帧会在空中错失(prohibitJump+无接触=跳不触发→永卡); 梯子每6f一次,
    // 首个着板帧生效, 后续梯级全在飞行中=无害no-op; 梯子止于+30(<飞行39f)
    setIn("fb", {}, f);
    if (Ay < 444 && Math.abs(fbF - Ay) < 8 && Math.abs(fbS.vy) < 50) { mark.aT0 = f; fbP = "a2col"; say(`A${Ay.toFixed(1)} fb(${fbS.x.toFixed(0)},${fbF.toFixed(0)}) 触发梯子`, f); }
    if (f > 900 && mark.aT0 === undefined) { fbP = "STUCK"; say(`⚠ride未触发(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "a2col") {
    // 起跳梯子: U↓ @ aT0+2,8,14,20,26 (5级, 间隔6); 右键全程常按(后续 shelfEast 也要);
    // 首个着板梯级生效(顶点 296-311 净空 9-24px), 其余梯级在飞行中 no-op
    const lad = f - (mark.aT0 + 2);
    if (f < mark.aT0 + 2) setIn("fb", {}, f);
    else if (lad <= 24 && lad % 6 === 0) setIn("fb", { right: true, up: true }, f);
    else setIn("fb", { right: true }, f);
    if (mark.aJp === undefined && lad >= 0 && Math.abs(fbS.vy) > 100) { mark.aJp = f; say(`fb A顶起跳(f${f})`, f); }
    if ((mark.aJp ?? mark.aT0 + 34) + 14 < f && Math.abs(fbS.vy) < 8 && fbF > 305 && fbF < 338 && fbS.x > 130 && fbS.x < 232) { fbP = "shelfEast"; say(`fb落柱/shelf台(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.aT0 + 200) { fbP = "STUCK"; say(`⚠a2col失败(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "shelfEast") {
    // 台(顶320)东行直穿熔岩盆([5]下[3]平[4]'/'自爬, fb免疫)到r10(384-512,顶320)
    setIn("fb", { right: true }, f);
    if (Math.abs(fbS.vy) < 8 && fbF > 300 && fbF < 340 && fbS.x > 386 && fbS.x < 511) { fbP = "toR8"; say(`fb越盆到r10(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (fbF > 380) { fbP = "STUCK"; say(`⚠shelfEast坠落(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "toR8") {
    // r10东行到[105]西面(480)贴脸停稳12帧 → 松手垂直坠落: 先沿[105]西脸(256-288)下滑,
    // 288 以下自由落, y480-576 段贴 [51]/[56]/[62] 栈东脸(448)滑(净距0.6px 求解器钉定) → 落[45]顶(462±3,576)
    // —— 弃 toR8 跳+r8E 两段飞行(落窗 782-818 贴[80]东墙832/发射擦[110]西脸 实测 mc 549-564 死)
    if (fbS.x > 460 && Math.abs(fbS.vx) < 30 && Math.abs(fbS.vy) < 5) mark.stopN8 = (mark.stopN8 || 0) + 1; else if (!mark.r8j) mark.stopN8 = 0;
    if (!mark.r8j && (mark.stopN8 || 0) >= 12) { mark.r8j = f; setIn("fb", { right: true, up: true }, f); }
    else setIn("fb", { right: true }, f);
    if (mark.r8j && f > mark.r8j + 15 && Math.abs(fbS.vy) < 8 && fbF < 270 && fbS.x > 478) { fbP = "r8E"; say(`fb落[105](${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (mark.r8j && f > mark.r8j + 120) { fbP = "STUCK"; say(`⚠toR8失败(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (!mark.r8j && f > 2000) { fbP = "STUCK"; say(`⚠toR8未稳(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "r8E") {
    // [105]顶(256面)东行到[110]西脸贴钉(560.6)停稳12帧, 满持右长飞落384台(768-864,顶384)
    if (fbS.x > 553 && Math.abs(fbS.vx) < 30 && Math.abs(fbS.vy) < 5) mark.stopNB = (mark.stopNB || 0) + 1; else if (!mark.bj1) mark.stopNB = 0;
    if (!mark.bj1 && (mark.stopNB || 0) >= 12) { mark.bj1 = f; setIn("fb", { right: true, up: true }, f); }
    else setIn("fb", { right: true }, f);
    if (mark.bj1 && f > mark.bj1 + 12 && Math.abs(fbS.vy) < 8 && fbF > 372 && fbF < 412 && fbS.x > 762 && fbS.x < 834) { fbP = "ledgeSet"; say(`fb落384台(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (mark.bj1 && f > mark.bj1 + 100) { fbP = "STUCK"; say(`⚠r8E失败(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "ledgeSet") {
    // 384台(768-864,顶384): 停稳 x≤804(791±5 吸收r8E落点±30) → 预走12f → 松左: 停点必 <768 翻落,
    // 空中不持键(τ刹车吃残速); 若贴[80]西脸(768)则求解器钉 x=754 沿脸下滑——
    // 走廊 y384 仅 736-768 共 32px/体宽28(轨迹窗口4px 必挂), 墙贴滑动是几何钉定非轨迹
    if (mark.leS !== undefined) {
      // 停稳后 +3f 垫 → 满西跳 {left,up} → 持左贯穿飞行(长按进墙):
      // 上升段即漂到 x≤750 被西墙(736面, 224-512)钉定, 沿脸下滑至 512 以下自由落 → [19]
      // —— 走廊轨迹窗口仅 [750,754] 4px 必挂; 墙贴把约束变成单侧(够西即钉定), 漂移 51±6px 全部落入钉定域
      if (f < mark.leS + 3) setIn("fb", {}, f);
      else { setIn("fb", { left: true, up: true }, f); fbP = "ledgeFly"; mark.lf0 = f; say(`fb台缘起跳(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    } else if (fbS.x > 804) setIn("fb", { left: true }, f);
    else {
      setIn("fb", {}, f);
      if (Math.abs(fbS.vx) < 15 && Math.abs(fbS.vy) < 8) mark.lN = (mark.lN || 0) + 1; else mark.lN = 0;
      if ((mark.lN || 0) >= 6) { mark.leS = f; say(`fb台缘停稳(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    }
    if (fbF > 420 && fbS.x > 840) { fbP = "STUCK"; say(`⚠ledgeSet异常(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "ledgeFly") {
    // 满西跳 {left,up} 持左贯穿: 越过[61]上方(y~320过x640) / [110]下方, 落 [45] 顶(416-544@576, 128px 宽目标)
    // —— 放弃 750-768 缝(纯缝4px + [80]西北角彩票: hold9/11 WIN hold10 落[61] 实测混沌)
    if (f < mark.lf0 + 120) setIn("fb", { left: true }, f);
    else setIn("fb", {}, f);
    if (f > mark.lf0 + 20 && Math.abs(fbS.vy) < 8 && fbF > 560 && fbF < 615 && fbS.x > 416 && fbS.x < 544) { fbP = "p45"; mark.p45t = f; say(`fb落[45]顶(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.lf0 + 10 && Math.abs(fbS.vy) < 8 && fbF > 460 && fbF < 500 && fbS.x > 640 && fbS.x < 750) { fbP = "STUCK"; say(`⚠ledgeFly落[61]顶(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.lf0 + 200) { fbP = "STUCK"; say(`⚠ledgeFly坠落(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "p45") {
    // v17几何判死: 栈柱(416-448)从352(T3底)到576整面墙(f739实测vx被448面钉零), [45]西侧无路——东游行是被逼的
    setIn("fb", { right: true }, f);
    if (fbS.vy > 40) { fbP = "p44fly"; mark.p44t = f; say(`fb[44]缘飞出(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.p45t + 120) { fbP = "STUCK"; say(`⚠p45未离缘(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "p44fly") {
    // 持右贯穿飞行: 落 [19](672-800,顶768) ~754
    if (f < mark.p44t + 60) setIn("fb", { right: true }, f);
    else setIn("fb", {}, f);
    if (f > mark.p44t + 10 && Math.abs(fbS.vy) < 8 && fbF > 750 && fbF < 790 && fbS.x > 700 && fbS.x < 798) { fbP = "fbMidSet"; say(`fb落东块(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.p44t + 120) { fbP = "STUCK"; say(`⚠p44fly坠落(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "fbMidSet") {
    // 东块(768)西行到 MIDG 停稳——v17: 700→722, 停点 699-707, 距[19]西缘672 27+px
    const MG = +(process.env.MIDG || 722);
    if (fbS.x > MG) setIn("fb", { left: true }, f);
    else setIn("fb", {}, f);
    if (fbS.x <= MG) {
      if (Math.abs(fbS.vx) < 15 && Math.abs(fbS.vy) < 8) mark.fmN = (mark.fmN || 0) + 1; else mark.fmN = 0;
      if ((mark.fmN || 0) >= 6) { mark.fmW = f + 3; mark.fmJ = f + 13; fbP = "fbMidJump"; }
    }
    if (fbS.x < 660) { fbP = "STUCK"; say(`⚠fbMidSet过西(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "fbMidJump") {
    // 东块→中台[15](448-544,顶800): 停稳+3f垫+10f助跑(vx≈-200→vy钳~455,顶点降20px 避[44]/[45]底608擦碰) +持左贯穿
    if (f < mark.fmW) setIn("fb", {}, f);
    else if (f < mark.fmJ) setIn("fb", { left: true }, f);
    else if (f === mark.fmJ) setIn("fb", { left: true, up: true }, f);
    else if (f < mark.fmJ + 38) setIn("fb", { left: true }, f);
    else setIn("fb", {}, f);
    if (f > mark.fmJ + 20 && Math.abs(fbS.vy) < 8 && fbF > 780 && fbF < 826 && fbS.x > 440 && fbS.x < 548) { fbP = "fbNw"; say(`fb落中台(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.fmJ + 130) { fbP = "STUCK"; say(`⚠fbMidJump失败(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "fbNw") {
    // 中台西行, 松左@≤FBR —— v17: 475→500(三闸同调之 nw 东移, 停点 479-495, 距[15]西缘448 31+px)
    if (Math.abs(fbS.vy) < 8 && fbF > 712 && fbF < 755 && fbS.x > 350 && fbS.x < 392) { fbP = "fdoor"; say(`fb落p1顶→直行门块(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (fbS.x > FBR) setIn("fb", { left: true }, f);
    else {
      setIn("fb", {}, f);
      if (Math.abs(fbS.vx) < 15 && Math.abs(fbS.vy) < 8) mark.fnN = (mark.fnN || 0) + 1; else mark.fnN = 0;
      if ((mark.fnN || 0) >= 6) { mark.fdW = f + 3; mark.fdP = mark.fdW + FBP; mark.fdH = mark.fdP + FBH; fbP = "fbDoorFly"; }
    }
    if (fbS.x < 430) { fbP = "STUCK"; say(`⚠fbNw过西(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "fbDoorFly") {
    // 中台NW角: 停稳+3垫+FBP预走+跳{left,up}持左FBH —— v17: FBH 60→65(漂移+20, 擦点西移) + p1落面尾巴
    if (f < mark.fdW) setIn("fb", {}, f);
    else if (f < mark.fdP) setIn("fb", { left: true }, f);
    else if (f === mark.fdP) setIn("fb", { left: true, up: true }, f);
    else if (f < mark.fdH) setIn("fb", { left: true }, f);
    else setIn("fb", {}, f);
    if (f > mark.fdP + 30 && Math.abs(fbS.vy) < 8 && fbF > 655 && fbF < 700 && fbS.x > 344 && fbS.x < 389) { fbP = "fbP1walk"; say(`fb落p1顶/角(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.fdP + 30 && Math.abs(fbS.vy) < 8 && fbF > 712 && fbF < 755 && fbS.x > 128 && fbS.x < 348) { fbP = "fdoor"; say(`fb直落高原(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.fdP + 160) { fbP = "STUCK"; say(`⚠fbDoorFly失败(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "fbP1walk") {
    // p1 顶面(354-382@672) 持左西行 → 出西缘走落 64px → 高原(736) → fdoor (镜像 wg p1walk)
    setIn("fb", { left: true }, f);
    if (Math.abs(fbS.vy) < 8 && fbF > 712 && fbF < 755 && fbS.x > 128 && fbS.x < 360) { fbP = "fdoor"; say(`fb p1走落高原(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
    if (f > mark.fdP + 260 || fbF > 830) { fbP = "STUCK"; say(`⚠fbP1walk失败(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  } else if (fbP === "fdoor") {
    if (fbS.x > 214) setIn("fb", { left: true }, f);
    else if (fbS.x < 200) setIn("fb", { right: true }, f);
    else { setIn("fb", {}, f); fbP = "FSTAND"; say(`★fb火门(${fbS.x.toFixed(0)},${fbF.toFixed(0)})`, f); }
  }

  // ============ wg ============
  if (wgP === "runPush") {
    if (f < 6) setIn("wg", {}, f); else setIn("wg", { left: true }, f);
    if (bx < 940) { wgP = "slotDrop"; say(`箱入槽(${bx.toFixed(0)}) wg(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "slotDrop") {
    if (wgS.x > 962) setIn("wg", { left: true }, f); else setIn("wg", {}, f);
    if (Math.abs(wgS.vy) < 8 && wgF > 150 && wgF < 700) { wgP = "onB"; say(`wg落B(${wgS.x.toFixed(0)},${wgF.toFixed(0)}) B顶${By.toFixed(0)}`, f); }
    if (wgF > 700) { wgP = "STUCK"; say(`⚠slotDrop过深(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "onB") {
    setIn("wg", {}, f);
    if (By > 625 && Math.abs(wgS.vy) < 10) { wgP = "ledgeE"; say(`B到底 wg(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "ledgeE") {
    // 东行 ledge(864-1088,顶640)→[32]45°坡(1088-1120, 640→672); x≥1100 坡上松右(条件自同步):
    // 沿坡滑出端点(1120,672) 水平分量~160, 落点漂~20 → 坑底[13]顶(1120-1152@800, 干燥);
    // 上方[49]坡(1120-1152, 576→544)封顶禁跳; 东墙[18](1152+)顶有绿水(面736)——全速冲出即死
    if (wgS.x < 1100) setIn("wg", { right: true }, f);
    else { setIn("wg", {}, f); wgP = "pitFall"; say(`wg坡上松右(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (wgF > 700) { wgP = "STUCK"; say(`⚠ledgeE坠落(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "pitFall") {
    // 滑出坡端坠(出口漂移双模态: ≤33 滑63°'\'面(1152,736)→(1120,800)落坑底 / >33 越(1152,736)
    // 角落 736 台阶顶); f400 起持右: A 模钉坑东墙(1142,800)等待, B 模 736 台顶东行数步——
    // 两模态都在 T3 定帧转左西行: 相位滑移(B载具+24f)+模态分裂双吸收
    // (v12 实测: 滑移使定点起跳散布 ±87px→ebFly 东壁撞死 fb#0/fb#1/wg#0/wg#2 四事件)
    // v15 万能钉: 402 转左(模态漏斗: 坑底/'\'面/736台顶 都漏到 832 平地 ~1055±10 @f~432±24)
    // → 430 转右(东行: 45°[14]坡可步行上! 探针实证 爬坡回坑底) → 全模态/全滑移汇聚
    // 钉坑东墙 (1136.4,800) @f~480±15 (B载具 +24f 相位滑移被完全吸收)
    if (f < 402) setIn("wg", {}, f);
    else if (f < 430) setIn("wg", { left: true }, f);
    else { setIn("wg", { right: true }, f); wgP = "rampBack"; }
    if (wgF > 900) { wgP = "STUCK"; say(`⚠pitFall坠落(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "rampBack") {
    // 东行回爬: 45°坡(1088-1120)可步行上(探针实证 v(+68,-68) 稳态爬升) → 坑底东行 → 钉东墙
    setIn("wg", { right: true }, f);
    if (wgS.x > 1130 && Math.abs(wgS.vx) < 8 && Math.abs(wgS.vy) < 8) { mark.rbN = (mark.rbN || 0) + 1; } else mark.rbN = 0;
    if ((mark.rbN || 0) >= 6) { wgP = "pinWait"; say(`wg钉坑东墙(${wgS.x.toFixed(1)},${wgF.toFixed(0)})`, f); }
    if (f > 590) { wgP = "STUCK"; say(`⚠rampBack未钉(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "pinWait") {
    // 坑东墙钉(1136.4,800)等待: 时间/位置双确定 → T3 定帧出发
    const T3 = +(process.env.P3 || 505);
    if (f < T3) setIn("wg", { right: true }, f);
    else { setIn("wg", { left: true }, f); wgP = "pinGo"; say(`wg钉出发(${wgS.x.toFixed(1)},${wgF.toFixed(0)})`, f); }
    if (wgF > 832) { wgP = "STUCK"; say(`⚠pinWait坠落(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "pinGo") {
    // 钉(1136.4,800)出发西行: 下[14]坡(24f)→[10](832)满速西行(29f)→固定帧起跳
    // 发射 931±8 满速弧 vx钳-248/vy430 → 落[19] 745±10 (双缘裕≥55)
    const PJ = +(process.env.PJ || 559);
    if (f < PJ) setIn("wg", { left: true }, f);
    else { setIn("wg", { left: true, up: true }, f); mark.ebJ2 = PJ; wgP = "ebFly"; say(`wg[10]满速跳(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (wgF > 850) { wgP = "STUCK"; say(`⚠pinGo坠落(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "ebFly") {
    // 半速弧: 发射(934±5,832) v(-207,-449) → 落(727±15,768), 距沿口/西缘各≥55px; 持左贯穿飞行(≤90f)
    if (f < mark.ebJ2 + 90) setIn("wg", { left: true }, f);
    else setIn("wg", {}, f);
    if (f > mark.ebJ2 + 20 && Math.abs(wgS.vy) < 8 && wgF > 750 && wgF < 790 && wgS.x > 660 && wgS.x < 800) { wgP = "midSet"; say(`wg落东块(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (f > mark.ebJ2 + 130) { wgP = "STUCK"; say(`⚠ebFly失败(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "midSet") {
    // 东块(768)西行到~700停稳(松左后 7v 刹车滑停 ~684)
    if (wgS.x > 700) setIn("wg", { left: true }, f);
    else setIn("wg", {}, f);
    if (wgS.x <= 700) {
      if (Math.abs(wgS.vx) < 15 && Math.abs(wgS.vy) < 8) mark.mN = (mark.mN || 0) + 1; else mark.mN = 0;
      if ((mark.mN || 0) >= 6) { mark.mW = f + 3; mark.mJ = f + 13; wgP = "midJump"; }
    }
    if (wgS.x < 660) { wgP = "STUCK"; say(`⚠midSet过西(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "midJump") {
    // 东块→中台[15](448-544,顶800): 停稳+3f垫+10f助跑(vx≈-200→vy钳~455 顶点降20px 避[44]/[45]底608擦碰) +持左贯穿
    if (f < mark.mW) setIn("wg", {}, f);
    else if (f < mark.mJ) setIn("wg", { left: true }, f);
    else if (f === mark.mJ) setIn("wg", { left: true, up: true }, f);
    else if (f < mark.mJ + 40) setIn("wg", { left: true }, f);
    else setIn("wg", {}, f);
    if (f > mark.mJ + 20 && Math.abs(wgS.vy) < 8 && wgF > 790 && wgF < 822 && wgS.x > 440 && wgS.x < 548) { wgP = "nwCorner"; say(`wg落中台(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (f > mark.mJ + 130) { wgP = "STUCK"; say(`⚠midJump失败(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "nwCorner") {
    // 中台西行, 松左@≤DFR(停点454-468 避[15]西缘448刹车漂移坠井)
    if (Math.abs(wgS.vy) < 8 && wgF > 712 && wgF < 755 && wgS.x > 350 && wgS.x < 392) { wgP = "wdoor"; say(`wg落p1顶→直行门块(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (wgS.x > DFR) setIn("wg", { left: true }, f);
    else {
      setIn("wg", {}, f);
      if (Math.abs(wgS.vx) < 15 && Math.abs(wgS.vy) < 8) mark.nN = (mark.nN || 0) + 1; else mark.nN = 0;
      if ((mark.nN || 0) >= 6) { mark.dW = f + 3; mark.dP = mark.dW + DFP; mark.dH = mark.dP + DFH; wgP = "doorFly"; }
    }
    if (wgS.x < 430) { wgP = "STUCK"; say(`⚠nwCorner过西(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "doorFly") {
    // 中台NW角: 停稳+3垫+DFP预走+跳{left,up}持左DFH —— v17: DFH60 使弧线落 p1 顶面(contact 355-360)
    // 而非东北角(382,672)栖落; 角栖落(x<386)亦被接纳→p1walk 走西——唯一死路=contact>386 坠槽(382-416)
    if (f < mark.dW) setIn("wg", {}, f);
    else if (f < mark.dP) setIn("wg", { left: true }, f);
    else if (f === mark.dP) setIn("wg", { left: true, up: true }, f);
    else if (f < mark.dH) setIn("wg", { left: true }, f);
    else setIn("wg", {}, f);
    if (f > mark.dP + 30 && Math.abs(wgS.vy) < 8 && wgF > 655 && wgF < 700 && wgS.x > 344 && wgS.x < 389) { wgP = "p1walk"; say(`wg落p1顶/角(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (f > mark.dP + 30 && Math.abs(wgS.vy) < 8 && wgF > 712 && wgF < 755 && wgS.x > 128 && wgS.x < 348) { wgP = "wdoor"; WGRES = `win(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`; say(`wg直落高原(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (f > mark.dP + 160) { wgP = "STUCK"; WGRES = `stuck(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`; say(`⚠doorFly失败(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "p1walk") {
    // p1 顶面(354-382@672) 持左西行 28px 出西缘 → 走落 64px 到高原(736) 落 ~300-330 → wdoor
    setIn("wg", { left: true }, f);
    if (Math.abs(wgS.vy) < 8 && wgF > 712 && wgF < 755 && wgS.x > 128 && wgS.x < 360) { wgP = "wdoor"; WGRES = `win(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`; say(`wg p1走落高原(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
    if (f > mark.dP + 260 || wgF > 830) { wgP = "STUCK"; WGRES = `stuck(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`; say(`⚠p1walk失败(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  } else if (wgP === "wdoor") {
    if (wgS.x > 316) setIn("wg", { left: true }, f);
    else if (wgS.x < 292) setIn("wg", { right: true }, f);
    else { setIn("wg", {}, f); wgP = "WSTAND"; say(`★wg水门(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`, f); }
  }

  w.step(1 / 60, { fireboy: { ...fbIn }, watergirl: { ...wgIn } });
  if (f % 60 === 0) {
    const p1T = (-w.mechanisms.platforms[1].body.GetPosition().y * 32 - 64).toFixed(0);
    console.log(`f${f} fb(${fbS.x.toFixed(0)},${fbF.toFixed(0)}) wg(${wgS.x.toFixed(0)},${wgF.toFixed(0)}) A${Ay.toFixed(0)} B${By.toFixed(0)} P1顶${p1T} 杠${w.mechanisms.levers[0].state} [${fbP}|${wgP}]${w.phase !== "playing" ? " ★" + w.phase : ""}`);
  }
  if (fbS.dead || fbS.dying || wgS.dead || wgS.dying) {
    const who = (wgS.dead || wgS.dying) ? "wg" : "fb";
    if (who === "wg") WGRES = `death@f${f}(${wgS.x.toFixed(0)},${wgF.toFixed(0)})`;
    console.log(`死亡@f${f} fb(${fbS.x.toFixed(0)},${fbF.toFixed(0)}) wg(${wgS.x.toFixed(0)},${wgF.toFixed(0)}) [${fbP}|${wgP}]`); break;
  }
  if (String(fbP).startsWith("STUCK") || String(wgP).startsWith("STUCK")) break;
  if (w.phase === "win" || w.phase === "won") { console.log(`★★★ WIN @f${f}`); WGRES = "WIN"; break; }
}
if (wgP === "wdoor" || wgP === "WSTAND") WGRES = WGRES === "timeout" ? "wdoor" : WGRES;
console.log(`WGRES ${DFR}/${DFP}/${DFH} ${WGRES}`);
console.log("\nfbEv:", JSON.stringify(fbEv));
console.log("wgEv:", JSON.stringify(wgEv));

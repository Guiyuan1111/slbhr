// r02b forest_02 路线求解 v3：8 相剧本（fb/wg 步骤机）
// 几何/机制备忘（r02b 复核 build.ts/mechanisms.ts 定稿）：
//   液体行段 = 左端盖斜面(西端顶 → +16px/+41.6px 坡) + 中段顶 row+14.4 + 右端盖回升；全程可走。
//   角色：头圆心 y-6.4 r15.36（右缘 x+15.36）、脚底 y+35.2；站面=top-35.2 中心；净跳升 124.2。
//   hanging = distance+revolute 刚性摆，板 = 102.4px 宽六角板（h0 心(384,408) h1 心(864,424)），
//   绳非实体；P7 满速跳弧顶 y~324 恰从 h1 板(420)上空 75px 越过。
//   闸门 p1：压住升 2s 满程(中心 576→448)，离手回弹；桥 p0：压住西伸 64px/s，离手回缩。
//   门：站定 ~50 帧双门同拍 isUp → win。
// 用法: node --import tsx TEMP/r02/bot-f02.mjs [--total 2800] [--trace t.json] [--out route.json]
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
import { S, drive, toRouteDoc } from "./botcore.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const TOTAL = Number(argOf("total", "2800"));

// ---- 谓词库（y 均为中心口径；站面中心=面顶-35.2）----
const settled = (c) => c.me.grounded && Math.abs(c.me.vy) < 8 && Math.abs(c.me.vx) < 12;
const otherIn = (x0, x1, y0 = -1e9, y1 = 1e9) => (c) => c.other.x >= x0 && c.other.x <= x1 && c.other.y >= y0 && c.other.y <= y1;
/** 电梯(组0)全升（走廊开）：屏幕 y = -body.y*32 ≤ 449（MovingPlatform 无 x/y 属性，必须读 body） */
const gateUp = (c) => -c.w.mechanisms.platforms[1].body.GetPosition().y * 32 <= 449;
/** 桥(组2)已西伸到位（板心屏幕 x ≤ 620，即跨接 x544-704） */
const bridgeOut = (c) => -c.w.mechanisms.platforms[0].body.GetPosition().x * 32 <= 626;
/** 站在 y896 架面上 */
const onShelf896 = (c) => c.me.grounded && c.me.y > 840;

// ---- 相3：东架 → SE 阶梯 → y768 高原 → 跳 NW 入洞窟（两人共用）----
const seClimb = () => [
  S.settle("P3落定"),
  S.goTo(1080, 8, "P3走到SE块下"),
  S.jumpDrift("right", 0, 999, "P3跳贴x1184面落y800台"),
  S.wait(settled, "P3-y800落定"),
  S.jumpDrift("right", 0, 999, "P3跳上高原y768"),
  S.wait(settled, "P3高原落定"),
  S.goTo(1200, 10, "P3高原站位"),
  S.jumpDrift("left", 0, 999, "P3西跳入洞窟"),
  S.wait(settled, "P3洞窟落定"),
];

// ---- 相5：洞窟 → 西阶梯 y544 → 西岸条 y480（两人共用）----
const westClimb = () => [
  S.goTo(143, 5, "P5走到西阶下"),
  S.jumpDrift("left", 0, 999, "P5贴墙跳上西阶y544"),
  S.wait(settled, "P5西阶落定"),
  S.goTo(112, 6, "P5西阶东缘"),
  S.jumpDrift("right", 0, 27, "P5跳上西岸条y480"),
  S.wait(settled, "P5岸条落定"),
  S.goTo(244, 5, "P5岸条东缘候摆"),
];

// ---- 相6+7：h0 摆渡 → 岛 → 满速东跳越酸 → 东岸（两人共用；waitFirst=第二人等板）----
const pendulumCross = (waitFirst) => [
  ...(waitFirst ? [S.wait(otherIn(546, 736, 380, 430), "P6等前人落岛"), S.sleep(160, "P6等摆板回稳")] : []),
  S.jumpDrift("right", 0, 37, "P6跳上h0板"),
  S.wait(settled, "P6板上落定"),
  S.sleep(8, "P6随板东摆"),
  S.jumpDrift("right", 0, 60, "P6板起跳东渡"),
  S.wait((c) => c.me.x >= 546 && c.me.x <= 736 && c.me.y <= 425 && c.me.y >= 395 && c.me.grounded, "P6落岛"),
  S.sleep(6, "P6岛上稳身"),
  S.goTo(646, 6, "P7岛中助跑位"),
  S.runJump("right", 716, "P7满速跳越酸"),
  S.wait((c) => c.me.grounded && c.me.y > 430 && c.me.y < 462 && c.me.x > 962, "P7落东岸"),
];

// ---- 相7b：东塔爬升（东岸 y480 → F y384 → E y288 → y224 阶 → 西行上 ledge B y160）----
const eastTower = () => [
  S.goTo(1024, 8, "P7走到F面下"),
  S.jumpDrift("right", 0, 999, "P7贴墙跳上F"),
  S.wait(settled, "P7-F落定"),
  S.goTo(1098, 6, "P7-F东缘"),
  S.jumpDrift("right", 0, 999, "P7贴墙跳上E"),
  S.wait(settled, "P7-E落定"),
  S.goTo(1128, 6, "P7-E西缘"),
  S.jumpDrift("left", 0, 20, "P7跳上y224阶"),
  S.wait(settled, "P7-y224落定"),
  S.goTo(760, 14, "P7西行自动上y192/ledgeB"),
  S.wait(settled, "P7-ledgeB落定"),
];

// ============ FB 剧本（走岩浆侧）============
const fbProg = [
  // 相1：涉 r28 岩浆东渡到中架（sleep3 保证首事件 f≥3）
  S.settle("P1落定"),
  S.sleep(3, "P1起手"),
  S.goTo(560, 14, "P1涉r28岩浆东行"),
  // 相2：跳东岩浆夹层盖帽 → 涉行 → 落东架
  S.goTo(640, 8, "P2中架起跳位"),
  S.jumpDrift("right", 0, 999, "P2跳上东熔岩盖"),
  S.wait(settled, "P2盖落定"),
  S.goTo(955, 10, "P2涉盖东行"),
  S.hold("right", (c) => onShelf896(c) && c.me.x > 992, "P2跨盖东落"),
  // 相3：SE 阶梯入洞窟
  ...seClimb(),
  // 相4 闸门：FB 守 b0 → 等 wg 压稳 b1 → FB 穿廊
  S.goTo(1040, 6, "P4守b0"),
  S.sleep(15, "P4压稳b0"),
  S.wait(otherIn(170, 215, 600, 660), "P4等wg压b1"),
  S.goTo(300, 12, "P4穿岛下走廊"),
  // 相5-7：西爬 + 摆渡 + 东塔
  ...westClimb(),
  ...pendulumCross(0),
  ...eastTower(),
  // 相8 桥协作：fb 守 b3 → 等 wg 压稳 b2 → fb 过桥 → fb 门
  S.goTo(912, 6, "P8守b3"),
  S.sleep(15, "P8压稳b3"),
  S.wait(otherIn(300, 340, 100, 180), "P8等wg压b2"),
  S.goTo(300, 14, "P8过桥西行"),
  S.goTo(96, 6, "P8到fb门"),
  S.sleep(140, "P8驻门WIN"),
];

// ============ WG 剧本（走水侧）============
const wgProg = [
  // 相1：跳西水夹层盖帽 → 涉水东渡 → 落中架
  S.settle("P1落定"),
  S.sleep(3, "P1起手"),
  S.goTo(132, 5, "P1西架起跳位"),
  S.jumpDrift("right", 0, 999, "P1跳上西水盖"),
  S.wait(settled, "P1盖落定"),
  S.goTo(455, 10, "P1涉盖东行"),
  S.hold("right", (c) => onShelf896(c) && c.me.x > 480 && c.me.x < 704, "P1跨盖东落中架"),
  // 相2：涉 r28 水池 → 东架
  S.goTo(676, 8, "P2中架东缘"),
  S.hold("right", (c) => onShelf896(c) && c.me.x > 992, "P2涉r28水池东行"),
  // 相3：SE 阶梯入洞窟
  ...seClimb(),
  // 相4：等 fb 守 b0 → 等电梯全升 → 穿廊压 b1 → 等 fb 穿廊
  S.wait(otherIn(1020, 1060, 580, 660), "P4等fb守b0"),
  S.wait(gateUp, "P4等电梯全升"),
  S.goTo(192, 6, "P4穿廊到b1"),
  S.sleep(15, "P4压稳b1"),
  S.wait((c) => c.other.x < 580, "P4等fb穿廊清板"),
  // 相5-7：西爬 + 摆渡（等板稳）+ 东塔
  ...westClimb(),
  ...pendulumCross(true),
  ...eastTower(),
  // 相8：等桥西伸 → 过桥 → 压 b2 → 等 fb 过桥 → wg 门
  S.wait(bridgeOut, "P8等桥西伸"),
  S.goTo(300, 14, "P8过桥西行"),
  S.goTo(320, 6, "P8守b2"),
  S.sleep(15, "P8压稳b2"),
  S.wait((c) => c.other.x < 420 && c.other.y < 220, "P8等fb过桥"),
  S.goTo(208, 6, "P8到wg门"),
  S.sleep(140, "P8驻门WIN"),
];

const w = makeWorld("forest_02");
const r = drive(w, { fb: fbProg, wg: wgProg }, TOTAL, { logSteps: true, traceAll: true });
console.log("result:", JSON.stringify(r.result));
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log(`final fb=(${fbS.x.toFixed(1)},${fbS.y.toFixed(1)}) wg=(${wgS.x.toFixed(1)},${wgS.y.toFixed(1)}) phase=${w.phase}`);
const out = argOf("out", "");
if (out && r.result.won) {
  const doc = toRouteDoc("forest_02", r.events, Math.min(TOTAL, (r.result.winF ?? TOTAL) + 3), "r02b bot v3");
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log("route →", out, "fb/wg 事件:", doc.fb.length, doc.wg.length);
}
writeFileSync("TEMP/r02/t.json", JSON.stringify(r.trace));
console.log("trace → TEMP/r02/t.json", r.trace.length, "帧");

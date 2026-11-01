// fw-route-crystal3 槽 · crystal_03 环 9→12 全链探针 v2（双角色，C4 终点态起步）
// 已证机制（probe9/10/10b/11v1 逐帧实证）：
//  [环9] fb (704,320) 缘跑跳→floor320（落点 ~975 踢 box 东移，fb 落箱西侧）；wg 纯走断→416板→448板→
//        西楔下→row19→爬楔→row18 (749.7) 柱东待命（wgd 实测 E340/W260）。
//  [环10] box 入带存活窗=[1208.96,~1209.4)（0.45px）——入带帧落点决定入口 vx 死活；存活→出口镜像西抛
//         228px/s 滑出带停 row19 (~1136)；钉死→垂直下坠落带内→12f 冷却回传 Yo-Yo。
//         fb 任何入口 TP 落地后立即反向行走离带（左行 <1150）即可破乒乓。
//  [环11] box 西推上按钮(1056,608)→pusher tr>0.2→state1→group4 柱收起 platY 528→432→柱下通道 [480,576] 净空。
//  [环12] fb row18 西行→台阶 576→544→512→≤90 缘跑跳东→壁龛板(448)→东行穿 P6 带→P7 东出口+hold east 离带→门448；
//         wg row18 ~366 静跳→东楔(480)→西行穿 P6 带→P7 西出口+hold west 离带→门96→WON。
// 用法: node --import tsx TEMP/fw-rc3-1/probe11.mjs chain [brakeX]
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

const part = process.argv[2] ?? "chain";
const brakeX = process.argv[3] ? Number(process.argv[3]) : 905;
const NONE = { up: false, left: false, right: false };
const place = (w, role, sx, syCenter) => {
  const body = w.players[role === "fb" ? "fireboy" : "watergirl"].body;
  body.SetPosition(new B.b2Vec2(-sx / 32, -syCenter / 32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
  body.SetAwake(true);
};
const S = (w, role) => {
  const s = w.snapshotPlayer(role === "fb" ? "fireboy" : "watergirl");
  return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), vx: +(s.vx ?? 0).toFixed(2), vy: +(s.vy ?? 0).toFixed(2), atDoor: !!s.atDoor, dead: !!(s.dead || s.dying) };
};
const G = (w, role) => w.players[role === "fb" ? "fireboy" : "watergirl"].feetContacts.length > 0;
const boxP = (w) => {
  const p = w.mechanisms.props[0]?.body.GetPosition();
  return p ? { x: +(-p.x * 32).toFixed(2), y: +(-p.y * 32).toFixed(2) } : null;
};
const platY = (w) => +(-w.mechanisms.platforms[0].body.GetPosition().y * 32).toFixed(1);
const pusherS = (w) => w.mechanisms.pushers[0].state;

if (part !== "chain") { console.log("unknown part", part); process.exit(1); }
const w = makeWorld("crystal_03");
place(w, "fb", 611, 220.5);
place(w, "wg", 612, 220.5);
const log = [];
let st = { fb: "F0", wg: "W0" };
let fbJumpF = -1, wgJumpF = -1, brakeF = -1, boxTpCount = 0, tpFrame = -1, fbTpF = -1;
let lastBoxY = 290, lastFbY = 220.5;
let f;
const WG_E = 340, WG_W = 260;
for (f = 0; f < 3200; f++) {
  const fb = S(w, "fb");
  const wg = S(w, "wg");
  const bx = boxP(w);
  let fi = {}, wi = {};
  // ---- fb 状态机
  switch (st.fb) {
    case "F0": // 口袋东行满速走断→弹道飞落 416 板 (~797，落地 scrub vx 至 ~25)
      fi = f < 3 ? {} : { right: true };
      if (G(w, "fb") && f > 20 && fb.x > 750 && fb.x < 840 && fb.y > 370) { st.fb = "F1"; fbJumpF = f; log.push(`FB-SLAB@f${f} [${fb.x},${fb.y},vx${fb.vx}] 立即板跳`); }
      break;
    case "F1": // 板跳（慢速 vy≈493 升 121px）→落 floor320
      fi = f - fbJumpF < 12 ? { right: true, up: true } : { right: true };
      if (G(w, "fb") && f > fbJumpF + 20 && fb.y > 260 && fb.y < 310) { st.fb = "F2a"; log.push(`FB-LAND@f${f} [${fb.x},${fb.y},feet${(fb.y + 35.2).toFixed(1)}] box=[${bx.x},${bx.y}]`); }
      break;
    case "F2a": // 回退到 brakeX（已证存活相位 906-950）停 8f 再上撞推
      if (fb.x > brakeX + 3) fi = { left: true };
      else if (fb.x < brakeX - 3) fi = { right: true };
      else { fi = {}; if (brakeF < 0) brakeF = f; if (f - brakeF > 8) { st.fb = "F2"; brakeF = -1; log.push(`FB-BRAKED@f${f} [${fb.x},${fb.y}] box=[${bx.x},${bx.y}]`); } }
      break;
    case "F2": // 东推 box 至 TP
      fi = { right: true };
      if (Math.abs(bx.y - lastBoxY) > 40) { boxTpCount++; tpFrame = f; st.fb = "F3"; log.push(`BOX-TP#${boxTpCount}@f${f} box→[${bx.x},${bx.y}]`); }
      break;
    case "F3": // fb 持续东行入带→自身 TP（91.5% 死入带=钉 1209.35-1209.6）
      fi = { right: true };
      if (Math.abs(fb.y - lastFbY) > 40) { st.fb = "F4"; fbTpF = f; log.push(`FB-TP@f${f} fb→[${fb.x},${fb.y}]`); }
      break;
    case "F4": // hold left：离带(1208.96 西缘 0.4px)+西行贴箱东面→即推箱
      fi = { left: true };
      if (pusherS(w) === 1) { st.fb = "F8"; log.push(`LATCH@f${f} box=[${bx.x},${bx.y}] plat=${platY(w)} fb[${fb.x}]`); }
      else if (f > fbTpF + 400 && Math.abs(fb.vx) < 3 && G(w, "fb")) { st.fb = "F6"; log.push(`FB-STALLED@f${f} fb[${fb.x},${fb.y}] box[${bx.x},${bx.y}] 转东行找位`); }
      break;
    case "F6": { // fb 落箱西侧时的兜底：东行回带重穿（Yo-Yo 直至落箱东侧）
      const target = Math.min(1240, 1216);
      if (fb.x < target - 3) fi = { right: true };
      else { fi = {}; if (G(w, "fb") && Math.abs(fb.vx) < 6) { st.fb = "F3"; log.push(`FB-REENTER@f${f} [${fb.x},${fb.y}]`); } }
      break;
    }
    case "F8": // 松手让 box 惯性自停按钮上；起始帧立即跳越（1145.91,vx~141 弧线净空箱顶）；等柱全收
      if (fb.y > 500 && G(w, "fb")) { st.fb = "F9j"; fbJumpF = f; log.push(`FB-BOXJUMP@f${f} [${fb.x},${fb.y},vx${fb.vx}]`); break; }
      fi = {};
      if (platY(w) <= 434.5) { st.fb = "F9"; log.push(`COLUMN-DOWN@f${f} plat=${platY(w)} box=[${bx.x},${bx.y}]`); }
      break;
    case "F9j": // 越箱空中保持左
      fi = f - fbJumpF < 12 ? { left: true, up: true } : { left: true };
      if (f - fbJumpF > 16) { st.fb = "F9"; log.push(`FB-OVER-BOX@f${f} [${fb.x},${fb.y}]`); }
      break;
    case "F9": // 西行：row19→楔→row18→台阶→512 西端折返
      fi = { left: true };
      if (fb.x <= 55 && fb.y < 480 && fb.y > 420 && G(w, "fb")) { st.fb = "F9b"; log.push(`FB-AT-512W@f${f} [${fb.x},${fb.y}] 折返`); }
      break;
    case "F9b": // 东助跑，86-92 缘跑跳东上壁龛板
      fi = { right: true };
      if (fb.x >= 86 && fb.x <= 94 && fb.vx > 100 && G(w, "fb")) { st.fb = "F10"; fbJumpF = f; log.push(`FB-BOARDJUMP@f${f} [${fb.x},${fb.y},vx${fb.vx}]`); }
      break;
    case "F10": // 空中保持+落板→东行穿 P6 带
      fi = f - fbJumpF < 12 ? { right: true, up: true } : { right: true };
      if (fb.y < 350) { st.fb = "F11"; log.push(`FB-P6-TP@f${f} →[${fb.x},${fb.y}]`); }
      break;
    case "F11": // P7 东出口→东行至 fb 门 448 停门（425 刹车滑行压住门传感器）
      fi = { right: true };
      if (fb.x >= 425 && fb.y < 300 && G(w, "fb")) { fi = {}; log.push(`FB-DOOR-BRAKE@f${f} [${fb.x},${fb.y}]`); }
      break;
  }
  // ---- wg 状态机
  switch (st.wg) {
    case "W0": // 东行走断：口袋→416板→448板（固定 340f，停 942.48）
      if (f < 3) wi = {};
      else if (f < WG_E) wi = { right: true };
      else { st.wg = "W2"; log.push(`WG-SLAB-PARK@f${f} [${wg.x},${wg.y}] 转西行`); }
      break;
    case "W2": // 西行：448板→西楔下→row19→爬楔→row18→穿柱下通道→台阶→512 楼板西端（x≤55）
      wi = { left: true };
      if (wg.x <= 55 && wg.y < 480 && wg.y > 420 && G(w, "wg")) { st.wg = "W2b"; log.push(`WG-AT-512W@f${f} [${wg.x},${wg.y}] 折返`); }
      break;
    case "W2b": // 东助跑 86-94 缘跑跳→弧线中段穿 P6 带（东向）→P7 东出口=门台平台接入
      wi = { right: true };
      if (wg.x >= 86 && wg.x <= 94 && wg.vx > 100 && G(w, "wg")) { st.wg = "W3"; wgJumpF = f; log.push(`WG-BOARDJUMP@f${f} [${wg.x},${wg.y},vx${wg.vx}]`); }
      break;
    case "W3": // 空中保持→东出口落平台→东滑行减速（冷却护体）
      wi = f - wgJumpF < 12 ? { right: true, up: true } : { right: true };
      if (f - wgJumpF > 30 && G(w, "wg") && wg.y < 300 && Math.abs(wg.vx) < 40) { st.wg = "W4"; log.push(`WG-PLATFORM@f${f} [${wg.x},${wg.y}]`); }
      break;
    case "W4": // 平台西行→x≤345 转滑行减速
      wi = { left: true };
      if (wg.x <= 345 && wg.y < 300 && G(w, "wg")) { st.wg = "W4a"; log.push(`WG-BRAKE@f${f} [${wg.x},${wg.y},vx${wg.vx}]`); }
      break;
    case "W4a": // 滑行减速至 |vx| 60-100 起跳
      wi = {};
      if (wg.vx >= -78 && wg.vx <= -62 && G(w, "wg")) { st.wg = "W2j"; wgJumpF = f; log.push(`WG-BANDJUMP@f${f} [${wg.x},${wg.y},vx${wg.vx}]`); }
      break;
    case "W2j": // 跳越 P7 带（4f 左+上→8f 上→持续左漂，弧线中心越带 y[160,256] 上方）→落门台
      wi = f - wgJumpF < 4 ? { left: true, up: true } : f - wgJumpF < 12 ? { up: true } : { left: true };
      if (f - wgJumpF > 20 && G(w, "wg") && wg.y < 300 && wg.x < 264.9) { st.wg = "W5"; log.push(`WG-OVER-BAND@f${f} [${wg.x},${wg.y}]`); }
      break;
    case "W5": // 走向 wg 门 96 停门（压住传感器→沉 0.5px isUp）
      wi = wg.x > 99 ? { left: true } : wg.x < 93 ? { right: true } : {};
      if (w.phase === "won") { log.push(`WG-AT-DOOR@f${f} [${wg.x},${wg.y}]`); }
      break;
  }
  w.step(1 / 60, { fireboy: { ...NONE, ...fi }, watergirl: { ...NONE, ...wi } });
  const a = S(w, "fb");
  const g = S(w, "wg");
  lastBoxY = bx ? bx.y : lastBoxY;
  lastFbY = fb.y;
  if (f % 60 === 0) log.push(`f${f} fb(${st.fb})[${a.x},${a.y}] wg(${st.wg})[${g.x},${g.y}] box[${bx ? bx.x + "," + bx.y : "-"}] pusher=${pusherS(w)} plat=${platY(w)}`);
  if (a.dead || g.dead) { log.push(`DEAD@f${f} fb=${a.dead} wg=${g.dead}`); break; }
  if (w.phase === "won") { log.push(`WON@f${f} fb[${a.x},${a.y}]atDoor=${a.atDoor} wg[${g.x},${g.y}]atDoor=${g.atDoor}`); break; }
}
const a = S(w, "fb");
const g = S(w, "wg");
log.push(`END@f${f} phase=${w.phase} fb(${st.fb})[${a.x},${a.y},atDoor=${a.atDoor}] wg(${st.wg})[${g.x},${g.y},atDoor=${g.atDoor}]`);
console.log(log.join("\n"));

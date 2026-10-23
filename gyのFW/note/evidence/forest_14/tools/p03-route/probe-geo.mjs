/**
 * P-03 整关路线重建·几何/物理探针：
 *  A. 表面映射：给定 (x, yNear) 传送落点，读静止后 feet（映射实际可行走面高度）。
 *  B. 跳跃弧线：从指定表面起跳带方向，落 trace（测可达性）。
 *  C. roman 初始状态与承重行为。
 * 运行：node --import tsx TEMP/p03r/probe-geo.mjs
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;

function tp(w, role, x, feetY) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32));
  c.body.SetLinearVelocity(new V(0, 0));
}

function settle(w, role, n = 120) {
  for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  return w.snapshotPlayer(role);
}

/** 表面映射：从 yDrop 高度直落到第一个面 */
function surf(x, yDrop, role = "fireboy") {
  const w = makeWorld("forest_14");
  tp(w, role, x, yDrop);
  const s = settle(w, role);
  const dead = s.dead || s.dying;
  return { x: +s.x.toFixed(1), feet: +(s.y + HALF).toFixed(1), dead };
}

/** 跳跃弧线：落定在起跳点后按 jump {dir, holdF} 起跳，trace 全程 */
function jumpArc(x0, yDrop, dir, holdF, role = "fireboy") {
  const w = makeWorld("forest_14");
  tp(w, role, x0, yDrop);
  const st = settle(w, role);
  const startFeet = st.y + HALF;
  const inp = { ...NONE_INIT(), [dir === "left" ? "left" : "right"]: true, up: true };
  let minY = startFeet, maxX = st.x, minX = st.x, landed = null;
  const tr = [];
  for (let f = 0; f < 260; f++) {
    const i = f < 1 + holdF ? inp : IDLE;
    w.step(1 / 60, { fireboy: role === "fireboy" ? i : IDLE, watergirl: role === "watergirl" ? i : IDLE });
    const s = w.snapshotPlayer(role);
    tr.push([+s.x.toFixed(0), +(s.y + HALF).toFixed(0)]);
    if (s.dead || s.dying) return { dead: true, f, at: [s.x, s.y + HALF] };
    minY = Math.min(minY, s.y + HALF); maxX = Math.max(maxX, s.x); minX = Math.min(minX, s.x);
    if (f > 20 && Math.abs(s.vy) < 5 && Math.abs(s.vx) < 5) { landed = { f, x: +s.x.toFixed(1), feet: +(s.y + HALF).toFixed(1) }; break; }
  }
  return { startFeet: +startFeet.toFixed(1), apexFeet: +minY.toFixed(1), rise: +(startFeet - minY).toFixed(1), maxX: +maxX.toFixed(0), minX: +minX.toFixed(0), landed, tr };
}
function NONE_INIT() { return { up: false, left: false, right: false }; }

// ---------------- A. 表面映射 ----------------
console.log("== A. 表面映射（drop from given y）==");
const probes = [
  [96, 840, "出生台面"], [170, 840, "出生台面东缘"], [200, 840, "goo 上方(应死/不落)"],
  [304, 780, "island1 [256,352]@800"], [480, 748, "pyramid24 [448,512]@768"],
  [704, 780, "island2 [640,768]@800"], [864, 716, "pyramid23 [832,896]@736"],
  [1200, 680, "r22 east [1152,1248]@704"],
  [80, 620, "r20 平台@640"], [190, 590, "r19 island[160,224]@608"], [224, 558, "r18 island[192,256]@576"],
  [300, 526, "r17 平台@544"], [608, 558, "r18 mid[576,640]@576"], [880, 558, "r18 east[768,992]@576"],
  [700, 590, "r19 mid[608,800]@608"], [1030, 590, "r19 east[960,1088]@608"],
  [144, 430, "r14 col[128,160]@448"], [144, 495, "r16 WED_D"], 
  [336, 404, "r13 island[288,384]@416"], [700, 404, "r13 mega@416"], [1160, 374, "r12 east@384"],
  [256, 354, "runway r12@384"], [300, 354, "runway r12"], [1240, 310, "r10@320"],
  [120, 268, "门台@288"], [96, 268, "门台fb门位"], [192, 268, "门台wg门位"],
  [400, 168, "高台runway@192"], [500, 168, "高台runway"], [1080, 168, "NE台@192"], [1130, 168, "NE SLP_B"],
];
for (const [x, y, label] of probes) console.log(JSON.stringify({ label, ...surf(x, y) }));

// ---------------- B. 关键跳跃 ----------------
console.log("\n== B. 跳跃弧线 ==");
const jumps = [
  // [x0, dropY, dir, holdF, label]
  [180, 840, "right", 30, "出生台→东跃goo"],
  [245, 780, "left", 40, "island1→西(试r20楔)"],
  [340, 780, "right", 40, "island1东缘→东(island2?)"],
  [480, 748, "right", 40, "pyramid24顶→东"],
  [480, 748, "left", 40, "pyramid24顶→西"],
  [700, 748, "left", 40, "island2顶→西"],
  [700, 748, "right", 40, "island2顶→东"],
  [880, 716, "right", 40, "pyramid23顶→东"],
  [880, 716, "left", 40, "pyramid23顶→西"],
  [1030, 590, "left", 40, "r19east→西(r18east?)"],
  [300, 526, "right", 40, "r17→东"],
  [300, 526, "left", 40, "r17→西"],
  [620, 558, "left", 40, "r18mid→西"],
  [790, 558, "left", 40, "r18east西缘→西"],
  [960, 558, "right", 40, "r18east东缘→东"],
  [700, 404, "right", 40, "mega→东"],
  [700, 404, "left", 40, "mega→西(roman区)"],
  [620, 404, "left", 40, "mega西→西(island@416)"],
  [350, 404, "left", 40, "island@416→西"],
  [350, 404, "right", 40, "island@416→东"],
  [240, 354, "left", 40, "runway西→西"],
  [340, 354, "right", 40, "runway东→东"],
  [340, 354, "left", 40, "runway东→西跳高台?"],
  [400, 168, "right", 40, "高台→东"],
  [560, 168, "left", 40, "高台东缘→西"],
  [1240, 310, "left", 40, "r10西缘→西(NE SLP_B?)"],
  [1080, 168, "right", 40, "NE台→东(SLP_B下)"],
  [80, 620, "left", 40, "r20西→西(d6/d12)"],
];
for (const [x0, y0, dir, hf, label] of jumps) {
  const r = jumpArc(x0, y0, dir, hf);
  console.log(JSON.stringify({ label, ...r, tr: undefined }));
}

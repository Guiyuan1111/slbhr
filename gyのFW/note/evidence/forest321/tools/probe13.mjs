// r32d probe13：forest_32_1 路线镜像装配（v10-mirror）
// 差异(vs 32): 护城河岩浆→水(渡河角色镜像 fb↔wg) / 96平台 dy 3→5 / 东山装饰瓦×2移除(不用) / 球位+16(不用)
// 镜像相位: A wg西涉水+乘台 / fb踩钮; B wg 768东跳 / fb出坑等710; C wg beamB推箱西级联;
//           D wg推箱东入水河; E fb两跳过河(蹬箱); F fb登台 wg推箱压钮→平台载fb升;
//           G wg出坑西涉+96跳上UP台+A4; H 双人traverse(均从672台西起, 无平台分支)
// 用法: node --import tsx TEMP/r32/probe13.mjs [upto] [D=N] [F=N]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);

const NOIN = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const UR = { up: true, left: false, right: true };

const upto = process.argv[2] ?? "Z";
const DN = Number(process.argv[3] ?? 120);
const FN = Number(process.argv[4] ?? 300);

const w = makeWorld("forest_32_1");
let frame = 0;
const feetOf = (role) => { const s = w.snapshotPlayer(role); return { x: s.x, feet: s.y + 35.2, dying: s.dying }; };
const boxOf = () => { const b = w.mechs.props.find((p) => p.kind.startsWith("box")); const p = b.body.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; };
const platTop = () => { const q = w.mechs.platforms[1].body.GetPosition(); return -q.y * 32 - 16; };
function log(tag) {
  console.log(`[f${frame}] ${tag} fb(${feetOf("fireboy").x.toFixed(0)},${feetOf("fireboy").feet.toFixed(1)}) wg(${feetOf("watergirl").x.toFixed(0)},${feetOf("watergirl").feet.toFixed(1)}) box(${boxOf().x.toFixed(0)},${boxOf().y.toFixed(0)}) plat.top=${platTop().toFixed(0)}${feetOf("fireboy").dying || feetOf("watergirl").dying ? " DEAD" : ""}`);
}
// seg(dur, fbIn, wgIn, opts.wgJump/fbJump)
function seg(dur, fbIn, wgIn, opts = {}) {
  const { fbJump = -1, wgJump = -1 } = opts;
  for (let i = 0; i < dur; i++) {
    const fi = i === fbJump ? { ...fbIn, up: true } : fbIn;
    const gi = i === wgJump ? { ...wgIn, up: true } : wgIn;
    w.step(1 / 60, { fireboy: fi, watergirl: gi });
    frame++;
    if (feetOf("fireboy").dying || feetOf("watergirl").dying) { log("DEAD!"); process.exit(1); }
  }
}

seg(3, NOIN, NOIN);

// ---- A: wg 西涉水 / fb 东进坑踩钮 → 平台升载 wg ----
if (["A", "B", "C", "D", "E", "F", "G", "H", "Z"].includes(upto)) {
  seg(185, NOIN, L, { wgJump: 100 });
  seg(30, NOIN, NOIN);
  log("A1 wg west bank / 左岛?");
  seg(96, R, NOIN); // fb 东行进坑上按钮
  seg(20, NOIN, NOIN);
  seg(140, NOIN, NOIN); // fb 踩钮，平台升
  log("A done");
}

// ---- B: wg 768 东跳 672台西; fb 出坑西行至 ~710 ----
if (["B", "C", "D", "E", "F", "G", "H", "Z"].includes(upto)) {
  seg(4, NOIN, UR);
  seg(60, NOIN, R);
  seg(20, NOIN, NOIN);
  log("B1 wg on 672台西?");
  seg(10, NOIN, NOIN, { fbJump: 0 }); // fb 跳出坑
  seg(134, L, NOIN);
  seg(10, NOIN, NOIN);
  log("B2 fb waiting ~710");
}

// ---- C: wg 上 beamB 推箱西 ----
if (["C", "D", "E", "F", "G", "H", "Z"].includes(upto)) {
  seg(4, NOIN, UR); // 爬坡跳上 beamB (C 起点在坡底 221)
  seg(30, NOIN, R);
  seg(6, NOIN, NOIN);
  log("C0 wg on beamB?");
  seg(2, NOIN, UR);
  seg(24, NOIN, R);
  seg(14, NOIN, R);
  seg(8, NOIN, NOIN);
  seg(85, NOIN, L);
  seg(30, NOIN, NOIN);
  log("C1 box parked on 左岛?");
  seg(20, NOIN, NOIN);
  seg(66, NOIN, L);
  seg(30, NOIN, NOIN);
  log("C2 wg on 左岛");
}

// ---- D: wg 推箱东入水河 ----
if (["D", "E", "F", "G", "H", "Z"].includes(upto)) {
  seg(DN, NOIN, R);
  seg(150, NOIN, NOIN);
  log("D done box ~475?");
}

// ---- E: fb 两跳过河 → 西坑平台 (起跳点先东移 678→710 对齐 32 弧线) ----
if (["E", "F", "G", "H", "Z"].includes(upto)) {
  seg(8, R, NOIN);
  seg(2, UL, NOIN);
  seg(60, L, NOIN);
  seg(2, NOIN, NOIN);
  seg(20, NOIN, NOIN);
  seg(2, UL, NOIN);
  seg(90, L, NOIN);
  seg(40, NOIN, NOIN);
  log("E fb on west pit platform?");
}

// ---- F: fb 登台 → wg 推箱东渡压钮 → 平台载 fb 升 ----
if (["F", "G", "H", "Z"].includes(upto)) {
  seg(25, L, NOIN);
  seg(10, NOIN, NOIN);
  seg(40, NOIN, R);
  seg(FN, NOIN, R);
  seg(110, NOIN, NOIN);
  log("F box presses? plat top?");
  seg(12, R, NOIN); // fb 东避让
  seg(20, NOIN, NOIN);
  log("F done fb on platform");
}

// ---- G: wg 出坑西涉 + 96 跳上 UP 台 + A4; fb A4 东跳 ----
if (["G", "H", "Z"].includes(upto)) {
  seg(25, NOIN, L); // wg 西行至 b 坡底(~1010)
  seg(2, NOIN, UL); // 跳上 45° 坡
  seg(10, NOIN, L); // 上台面
  seg(70, NOIN, L); // 台面西行至西缘(~680)
  seg(6, NOIN, NOIN);
  seg(133, NOIN, L); // 下水涉行西至 ~150
  seg(12, NOIN, NOIN);
  log("G1 wg at 96jump spot?");
  seg(2, NOIN, L); // left 先行 2 帧
  seg(2, NOIN, UL); // up 2 帧：96px 跳上 UP 平台
  seg(30, NOIN, L); // 飞行+落台(~48)
  seg(8, NOIN, R); // 台面东行至 ~83
  seg(10, NOIN, NOIN);
  log("G2 wg on UP platform?");
  // 双人 A4: wg 先, fb 后（错峰防平台重叠）
  seg(4, NOIN, UR);
  seg(60, NOIN, R);
  seg(10, NOIN, NOIN);
  seg(4, UR, NOIN);
  seg(60, R, NOIN);
  seg(20, NOIN, NOIN);
  log("G done both on 672台西?");
}

// ---- H: 双人 traverse（与 probe11 相同阶梯, 无平台分支）----
function traverse(role) {
  const run = (dur, input) => seg(dur, role === "fb" ? input : NOIN, role === "wg" ? input : NOIN);
  const p0 = role === "fb" ? feetOf("fireboy") : feetOf("watergirl");
  console.log("[f" + frame + "] H(" + role + ") start (" + p0.x.toFixed(0) + "," + p0.feet.toFixed(1) + ")");
  const P = (r) => JSON.stringify(r === "fb" ? feetOf("fireboy") : feetOf("watergirl"));
  // a-ramp@r21 爬坡跳: 上 beamB
  run(4, UR); run(30, R); run(6, NOIN);
  console.log(`[f${frame}] H(${role}) on beamB? ` + P(role));
  run(200, R); run(60, R); run(10, NOIN);
  console.log(`[f${frame}] H(${role}) on F736? ` + P(role));
  run(6, R); run(4, UR); run(24, R); run(34, NOIN);
  console.log(`[f${frame}] H(${role}) at 97jump spot? ` + P(role));
  run(2, L); run(2, UL); run(140, L); run(10, NOIN);
  console.log(`[f${frame}] H(${role}) on 544台? ` + P(role));
  run(30, L); run(4, UL); run(30, L); run(6, NOIN);
  run(30, L); run(4, UL); run(30, L); run(6, NOIN);
  console.log(`[f${frame}] H(${role}) on beamA? ` + P(role));
  run(220, L); run(20, NOIN);
  console.log(`[f${frame}] H(${role}) on 左台? ` + P(role));
  run(2, L); run(2, UL); run(50, L); run(14, NOIN);
  console.log(`[f${frame}] H(${role}) st.a 柱480? ` + P(role));
  run(2, R); run(2, UR); run(30, R); run(20, NOIN);
  console.log(`[f${frame}] H(${role}) st.b 桥384? ` + P(role));
  run(6, L); run(2, L); run(2, UL); run(30, L); run(24, NOIN);
  console.log(`[f${frame}] H(${role}) st.c 塔288? ` + P(role));
  run(8, R); run(2, R); run(2, UR); run(40, R); run(24, NOIN);
  console.log(`[f${frame}] H(${role}) st.d 层224? ` + P(role));
  run(33, R); run(2, R); run(6, UR); run(40, R); run(30, NOIN);
  console.log(`[f${frame}] H(${role}) st.e 门台128? ` + P(role));
  if (role === "wg") { run(40, R); }
  run(60, NOIN);
}
if (["H", "Z"].includes(upto)) {
  traverse("fb");
  log("H1 fb at door?");
  traverse("wg");
  log("H2 wg at door?");
  seg(60, NOIN, NOIN);
}

log("final");
console.log("phase:", w.phase);

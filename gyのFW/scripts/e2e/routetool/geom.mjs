/**
 * 路线产线·关卡几何转储：真实解析器（level2.parseLevel）读关 → ASCII 网格 + 机关表。
 *
 * 用法：node --import tsx scripts/e2e/routetool/geom.mjs --level <id> [--mech]
 *
 * 坐标三系（换算关系，与内核 build.ts 一致）：
 *   屏幕px ≡ Tiled px（x 右增、y 下增）；b2 米 = (−px/32, −py/32)；格 = (floor(px/32), floor(py/32))。
 *   内核 trace/state 的玩家坐标即屏幕 px。
 * 图例：'#'实心  '/'斜A  '\'斜B  'C'楔C  'D'楔D  'w'水  'L'岩浆  'G'绿液  '.'空
 * 叠加：F/W 出生  ‖门  l拉杆  p压板  b箱  B重箱  o球  ~风机基座  ▒平台  h摆锚  u滑轮  r跷板  x隐墙
 *   （叠加只标代表格，精确几何看下方机关表；平台另画移动路径端点 '·'）
 */
import { argOf } from "../lib.mjs";
import { loadLevelDoc, makeProvider, locateLevel } from "./kernel.mjs";
import { parseLevel, GROUND_TYPE, windBodyPos } from "../../../packages/shared/src/level2.ts";
import { join } from "node:path";

const args = process.argv.slice(2);
const level = argOf(args, "level", "forest_06");
const showMech = args.includes("--mech");

const { dir } = locateLevel(level);
const lv = parseLevel(level, loadLevelDoc(level), makeProvider(dir));

const CHAR = { [GROUND_TYPE.SOLID]: "#", [GROUND_TYPE.SLOPE_A]: "/", [GROUND_TYPE.SLOPE_B]: "\\", [GROUND_TYPE.WEDGE_C]: "C", [GROUND_TYPE.WEDGE_D]: "D", [GROUND_TYPE.WATER]: "w", [GROUND_TYPE.LAVA]: "L", [GROUND_TYPE.GREEN]: "G" };
const grid = [];
for (let r = 0; r < lv.rows; r++) grid.push(new Array(lv.cols).fill("."));
for (let r = 0; r < lv.rows; r++)
  for (let c = 0; c < lv.cols; c++) {
    const t = lv.groundType[r * lv.cols + c];
    grid[r][c] = CHAR[t] ?? ".";
  }
const cellOf = (px, py) => [Math.floor(px / 32), Math.floor(py / 32)];
const stamp = (px, py, ch) => {
  const [c, r] = cellOf(px, py);
  if (r >= 0 && r < lv.rows && c >= 0 && c < lv.cols) grid[r][c] = ch;
};
const rectStamp = (x, y, w, h, ch) => {
  // 矩形轮廓标（顶边系 px）：只描外缘格，代表格用字符本体
  const c0 = Math.floor(x / 32), c1 = Math.floor((x + w - 1) / 32);
  const r0 = Math.floor(y / 32), r1 = Math.floor((y + h - 1) / 32);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    if (r < 0 || r >= lv.rows || c < 0 || c >= lv.cols) continue;
    const edge = c === c0 || c === c1 || r === r0 || r === r1;
    if (edge) grid[r][c] = grid[r][c] === "." ? ch : grid[r][c];
  }
};

console.log(`== ${lv.id}（${lv.cols}×${lv.rows} 格，${lv.widthPx}×${lv.heightPx}px）==`);
console.log(`出生 fb=${JSON.stringify(lv.spawn.fireboy)} wg=${JSON.stringify(lv.spawn.watergirl)}（屏幕px）`);
console.log(`门   fb=${JSON.stringify(lv.doors.fireboy)} wg=${JSON.stringify(lv.doors.watergirl)}（屏幕px）\n`);

stamp(lv.spawn.fireboy.x, lv.spawn.fireboy.y, "F");
stamp(lv.spawn.watergirl.x, lv.spawn.watergirl.y, "W");
for (const d of [lv.doors.fireboy, lv.doors.watergirl]) rectStamp(d.x, d.y, d.w, d.h, "|");
for (const m of lv.levers) stamp(m.x, m.y, "l");
for (const m of lv.pushers) stamp(m.x, m.y, "p");
for (const m of lv.boxes) stamp(m.x, m.y, m.heavy ? "B" : "b");
for (const m of lv.balls) stamp(m.x, m.y, "o");
for (const m of lv.winds) { const w = windBodyPos(m); stamp(w.x, w.y, "~"); }
for (const m of lv.hangings) stamp(m.pts[0].x, m.pts[0].y, "h");
for (const m of lv.pulleys) stamp(m.pts[0].x, m.pts[0].y, "u");
for (const m of lv.romans) stamp(m.pts[0].x, m.pts[0].y, "r");
for (const m of lv.windows) rectStamp(m.x, m.y, m.w, m.h, "x");
for (const m of lv.platforms) {
  rectStamp(m.x, m.y, m.w, m.h, "▒");
  if (!m.dtheta && (m.dx || m.dy)) {
    // 平移路径端点描 '·'
    rectStamp(m.x + m.dx * 32, m.y + m.dy * 32, m.w, m.h, "·");
  }
}

const hdr = "    " + Array.from({ length: lv.cols }, (_, c) => String(c % 10)).join("");
console.log(hdr);
for (let r = 0; r < lv.rows; r++) console.log(String(r).padStart(3) + "  " + grid[r].join(""));

// ---- 机关表 ----
const px = (v) => (typeof v === "number" ? Math.round(v) : v);
const row5 = (label, arr, fmt) => {
  if (!arr.length) return;
  console.log(`\n${label}（${arr.length}）:`);
  for (const m of arr) console.log("  " + fmt(m));
};
row5("拉杆 LeverDef", lv.levers, (m) => `${m.id} 组${m.group} 中心(${px(m.x)},${px(m.y)}) onis=${m.onis} startPos=${m.startPos}`);
row5("压板 PusherDef", lv.pushers, (m) => `${m.id} 组${m.group} 中心(${px(m.x)},${px(m.y)})`);
row5("平台 PlatformDef", lv.platforms, (m) => {
  const kind = m.dtheta != null ? `旋转臂 dtheta=${m.dtheta}° offsetY=${m.offsetY ?? "-"}` : `平移 dx=${m.dx} dy=${m.dy}`;
  return `${m.id} 组${m.group} rect(${px(m.x)},${px(m.y)},${px(m.w)},${px(m.h)}) ${kind} rotation=${m.rotation}° → 终点A(${px(m.x)},${px(m.y)}) 终点B(${px(m.x + m.dx * 32)},${px(m.y + m.dy * 32)})`;
});
row5("箱 BoxDef", lv.boxes, (m) => `${m.id}${m.heavy ? "[重]" : ""} 中心(${px(m.x)},${px(m.y)}) rotation=${m.rotation}°`);
row5("球 BallDef", lv.balls, (m) => `${m.id} 中心(${px(m.x)},${px(m.y)})`);
row5("风 WindDef", lv.winds, (m) => {
  const w = windBodyPos(m);
  return `${m.id} 组${m.group} rect(${px(m.rect.x)},${px(m.rect.y)},${px(m.rect.w)},${px(m.rect.h)}) rotation=${m.rotation}° 长${m.lengthM}m 初始=${m.initialState}(${m.initialState ? "常开" : "常关"}) 体(${px(w.x)},${px(w.y)})`;
});
row5("摆板 HangingDef", lv.hangings, (m) => `${m.id} 锚(${px(m.pts[0].x)},${px(m.pts[0].y)}) fullRotation=${!!m.fullRotation} 点列=${m.pts.map((p) => `(${px(p.x)},${px(p.y)})`).join("→")}`);
row5("滑轮 PulleyDef", lv.pulleys, (m) => `${m.id} 点列=${m.pts.map((p) => `(${px(p.x)},${px(p.y)})`).join("→")}`);
row5("跷跷板 RomanDef", lv.romans, (m) => `${m.id} 点列=${m.pts.map((p) => `(${px(p.x)},${px(p.y)})`).join("→")}`);
row5("隐形墙 WindowDef", lv.windows, (m) => `${m.id} rect(${px(m.x)},${px(m.y)},${px(m.w)},${px(m.h)})`);
row5("液体 LiquidRun", lv.liquidRuns, (m) => `${m.kind} 行${m.row} 列${m.col0}-${m.col1}`);
if (lv.diamonds.length) console.log(`\n钻石（${lv.diamonds.length}，非通关条件）`);
if (lv.unknown.length) console.log(`\nunknown（解析跳过）: ${lv.unknown.join("; ")}`);

if (showMech) console.log("\n" + JSON.stringify({ levers: lv.levers, pushers: lv.pushers, platforms: lv.platforms, boxes: lv.boxes, balls: lv.balls, winds: lv.winds, hangings: lv.hangings, pulleys: lv.pulleys, romans: lv.romans, windows: lv.windows, doors: lv.doors, spawn: lv.spawn }, null, 1));

console.log(`
手感常数（params.ts）：gravity=31.25 jumpVelocity=15.5m/s runForce=50N maxSpeed=8.5m/s≈0.142格/帧
（跑力有爬升：首帧不发力→0.475·runForce 起步；实际位移以 validate --trace 逐帧位置校准为准）
物理 y 轴向上：b2=(−px/32,−py/32)；跳跃满弹道 ~v²/2g≈3.84m≈3.8 格（滞空 ~1s）。`);

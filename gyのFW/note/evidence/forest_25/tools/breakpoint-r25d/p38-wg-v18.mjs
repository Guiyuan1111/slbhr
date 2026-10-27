// v18 终线：坠池→唇口→pin→HOP(T224)→224西落256→256西落shelf东→shelf东缘走落
// →绿台(864,固体安全)→西行→UL跳墙顶[256,320]x768→西走落前厅→门(208,900)
// 依据：tile6=水池(wg致死带[325.8,352]但池底站立传感~314安全,实测两次存活)
//       tile8=绿池=固体装饰(liquidKindOf(8)=undefined,非液体)  tile5=熔岩(仅杀fb)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const U = { up: true, left: false, right: false };
const UL = { up: true, left: true, right: false };

export function wgRun18(p = {}) {
  const { trace = false, pulL = 4, wjHold = 12 } = p;
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, q) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(q.x), px(q.y)]); };
  let phase = "SW", jt = -1, done = "";
  for (let f = 0; f < 3000; f++) {
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (phase) {
        case "SW":
          if (q.y > 120) phase = "DROP", jt = 0;
          return L;
        case "DROP":
          jt++;
          if (q.y > 290 && q.x > 570 && q.x < 745 && Math.abs(q.vy) < 20) { mark("POOL", f, q), phase = "POOLW", jt = 0; return N; }
          if (jt > 400) { phase = "FAIL-DROP"; return N; }
          return L;
        case "POOLW": {
          jt++;
          if (q.y < 285 && q.x < 600 && q.x > 500) { mark("LIP", f, q), phase = "STAIR", jt = 0; return N; }
          if (q.x < 500 && q.y > 285) { phase = "FAIL-POOL-OVERSHOOT"; return N; }
          if (jt > 600) { phase = "FAIL-POOLW"; return N; }
          return (f % pulL) < pulL - 1 ? L : N; }
        case "STAIR": {
          jt++;
          if (q.x < 558 && q.x > 545 && q.y > 252 && q.y < 272 && Math.abs(q.vx) < 0.6) { mark("PIN", f, q), phase = "HOP", jt = 0; return U; }
          if (jt > 200) { phase = "FAIL-STAIR"; return N; }
          return (f % pulL) < pulL - 1 ? L : N; }
        case "HOP": {
          jt++;
          if (jt > 4 && q.y > 180 && q.y < 215 && Math.abs(q.vy) < 12 && q.x > 445 && q.x < 512) { mark("T224", f, q), phase = "W224", jt = 0; return N; }
          if (jt > 4 && q.y > 215 && q.y < 240 && Math.abs(q.vy) < 12 && q.x > 448 && q.x < 513) { mark("T256", f, q), phase = "W224", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-HOP"; return N; }
          return jt <= 24 ? U : (jt <= 44 ? L : N); }
        case "W224": { // 224 台西行→西缘(463.4)走落→256 顶→西缘→shelf 东
          jt++;
          if (q.y > 245 && q.y < 268 && Math.abs(q.vy) < 12 && q.x > 445 && q.x < 513) { mark("T256", f, q), phase = "W256", jt = 0; return N; }
          if (jt > 200) { phase = "FAIL-W224"; return N; }
          return L; }
        case "W256": { // 256 西行→西缘走落→shelf
          jt++;
          if (q.y > 400 && q.y < 428 && Math.abs(q.vy) < 12 && q.x > 425 && q.x < 570) { mark("SHELF", f, q), phase = "ESHELF", jt = 0; return N; }
          if (jt > 200) { phase = "FAIL-W256"; return N; }
          return L; }
        case "ESHELF": { // shelf 东行到东缘(576)走落→hyp 滑落→绿台
          jt++;
          if (q.y > 470 && q.y < 500 && Math.abs(q.vy) < 8 && q.x > 590 && q.x < 625) { mark("HYPEND", f, q), phase = "GDIVE", jt = 0; return N; }
          if (q.y > 820 && q.y < 850 && Math.abs(q.vy) < 12 && q.x > 540 && q.x < 700) { mark("GREEN", f, q), phase = "WGREEN", jt = 0; return N; }
          if (jt > 300) { phase = "FAIL-ESHELF"; return N; }
          return R; }
        case "GDIVE": // 长坠绿台
          if (q.y > 820 && q.y < 852 && Math.abs(q.vy) < 12 && q.x > 540 && q.x < 700) { mark("GREEN", f, q), phase = "WGREEN", jt = 0; return N; }
          if (jt++ > 300) { phase = "FAIL-GDIVE"; return N; }
          return N;
        case "WGREEN": { // 绿台西行到墙(335.4)前起跳
          jt++;
          if (q.x < 340 && jt > 8) { mark("WJ", f, q), phase = "WJUMP", jt = 0; return UL; }
          if (jt > 300) { phase = "FAIL-WGREEN"; return N; }
          return L; }
        case "WJUMP": { // UL 跳墙顶 [256,320]x768（窗口 cx 271-306）
          jt++;
          if (jt > 6 && q.y > 725 && q.y < 748 && Math.abs(q.vy) < 12 && q.x > 268 && q.x < 308) { mark("WTOP", f, q), phase = "WWALL", jt = 0; return N; }
          if (jt > 6 && q.x < 268 && q.y > 700) { mark("WTOP2", f, q), phase = "WWALL", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-WJUMP"; return N; }
          return jt <= wjHold ? UL : N; }
        case "WWALL": // 墙顶西行→西缘(271.4)走落前厅
          if (q.x < 270) { mark("WOFF3", f, q), phase = "ANTEFALL", jt = 0; return L; }
          return L;
        case "ANTEFALL":
          if (q.y > 850 && q.x > 40 && q.x < 254) { mark("ANTE", f, q), phase = "DOORW", jt = 0; return N; }
          if (jt++ > 200) { phase = "FAIL-ANTEFALL"; return N; }
          return L;
        case "DOORW": { // 前厅西行到门 (208,900)
          jt++;
          if (q.x > 202 && q.x < 216 && Math.abs(q.vx) < 8) { mark("DOOR", f, q), phase = "SETTLE", jt = 0; return N; }
          if (jt > 300) { phase = "FAIL-DOORW"; return N; }
          return L; }
        case "SETTLE": {
          jt++;
          if (Math.abs(q.vx) < 4 && jt > 10) {
            const dr = w.built.doors.watergirl;
            mark("DONE", f, q);
            done = `door frac=${dr.frac} isUp=${dr.isUp} stand=(${px(q.x)},${px(q.y)}) f=${f}`;
            phase = "DONE";
          }
          return N; }
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (trace && f % 20 === 0 && f > 500) console.log(`  f${f}: (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)}) ${phase}`);
    if (q.dead) { done = `DEAD f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (String(phase).startsWith("FAIL")) { done = `FAIL@${phase} f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (phase === "DONE") break;
  }
  return { marks, done, phase, w };
}

const r = wgRun18({});
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

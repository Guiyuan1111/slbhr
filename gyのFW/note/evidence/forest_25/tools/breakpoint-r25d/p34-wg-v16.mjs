// v16 西线：板→坠池→西斜梯(288→256→224)→224西缘UL长跳→terrace→UL长跳→平顶→b0
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
// 几何依据（TEMP/r25d/p31+p32 fixture dump）：
//  - 走廊板 (832,128)-(1248,160)，wg 出生 (1152,96)
//  - 风柱 [752,1200]x[166,250]，mesa (800,256)-(1024,288) 西段 [800,985] 风可跑
//  - 池 (576,736)x[320,352]，西斜梯链: (576,352)-(618,336)hyp→唇(576,320)→(544,288)-(576,320)hyp
//    →pin 559.4→UL hop→256台[448,544]→(512,256)-(480,224)hyp→224台[448,480]
//  - 224西缘(463.4) UL 全程保持跳（漂移~240px）→落 terrace [207,272.6]（唯一西大门：
//    柱 x[288,320]x[32,256] 封死一切高空通路；landing窗=柱底西缘）
//  - terrace 西行至 ~205 刹停→UL 全程保持跳→平顶(0-128,128)/斜坡(128-160)→西行→b0(80,128)
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const U = { up: true, left: false, right: false };

export function wgRun16(p = {}) {
  const { trace = false, pulL = 4, tjHold = 99, sjHold = 99, hopHold = 10 } = p;
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, q) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(q.x), px(q.y)]); };
  let phase = "SW", jt = -1, done = "";
  for (let f = 0; f < 3000; f++) {
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (phase) {
        case "SW": // 板上西行，走到头自然坠落
          if (q.x < 862) mark("SW", f, q);
          if (q.y > 120) { phase = "DROP", jt = 0; }
          return L;
        case "DROP": // 坠落（风中微漂西），落到池区任意结构都继续 L 西排
          jt++;
          if (q.y > 290 && q.x > 570 && q.x < 745 && Math.abs(q.vy) < 20) { mark("POOL", f, q), phase = "POOLW", jt = 0; return N; }
          if (q.y > 245 && q.y < 268 && Math.abs(q.vy) < 10 && q.x > 748 && q.x < 810) { mark("PILLAR", f, q); }
          if (q.y > 200 && q.y < 245 && Math.abs(q.vy) < 10 && q.x > 795) { mark("MESA", f, q); }
          if (jt > 400) { phase = "FAIL-DROP"; return N; }
          return L;
        case "POOLW": { // 池底冷静西行（脉冲 L 防唇口弹射），爬西斜梯
          jt++;
          if (q.y < 285 && q.x < 600 && q.x > 500) { mark("LIP", f, q), phase = "STAIR", jt = 0; return N; }
          if (q.x < 500 && q.y > 285) { phase = "FAIL-POOL-OVERSHOOT"; return N; }
          if (jt > 600) { phase = "FAIL-POOLW"; return N; }
          return (f % pulL) < pulL - 1 ? L : N; }
        case "STAIR": { // (544,288)-(576,320) hyp 上行→pin 559.4→UL hop→256台
          jt++;
          if (q.x < 558 && q.x > 545 && q.y > 252 && q.y < 272 && Math.abs(q.vx) < 0.6) { mark("PIN", f, q), phase = "HOP", jt = 0; return UL; }
          if (jt > 200) { phase = "FAIL-STAIR"; return N; }
          return (f % pulL) < pulL - 1 ? L : N; }
        case "HOP": { // pin 起跳越 256 东面(544)，落 256 台 [448,544]
          jt++;
          if (jt > 4 && q.y > 215 && q.y < 240 && Math.abs(q.vy) < 12 && q.x > 448 && q.x < 545) { mark("T256", f, q), phase = "T256W", jt = 0; return N; }
          if (jt > 4 && q.y > 180 && q.y < 215 && Math.abs(q.vy) < 12 && q.x > 445 && q.x < 512) { mark("T224", f, q), phase = "T224W", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-HOP"; return N; }
          return jt <= 24 ? U : (jt <= 44 ? L : N); }
        case "T256W": // 256 西行上 (512,256)-(480,224) hyp→224台
          if (q.y < 205 && q.x > 440 && q.x < 515) { mark("T224", f, q), phase = "T224W", jt = 0; return N; }
          return L;
        case "T224W": { // 224 西行到西缘(463.4)前起跳
          jt++;
          if (q.x < 474 && jt > 6) { mark("TJ", f, q), phase = "TJUMP", jt = 0; return UL; }
          if (jt > 200) { phase = "FAIL-T224W"; return N; }
          return L; }
        case "TJUMP": { // 224西缘 UL 全程保持跳 → terrace [207,272.6]
          jt++;
          if (jt > 6 && q.y > 205 && q.y < 240 && Math.abs(q.vy) < 12 && q.x > 195 && q.x < 277) { mark("TERR", f, q), phase = "TWALK", jt = 0; return N; }
          if (jt > 6 && q.x < 195) { phase = "FAIL-TJ-OVERSHOOT"; return N; }
          if (jt > 150) { phase = "FAIL-TJUMP"; return N; }
          return jt <= tjHold ? UL : N; }
        case "TWALK": // terrace 西行至 ~205 刹停
          if (q.x < 205) { mark("TW", f, q), phase = "BRAKE", jt = 0; return N; }
          return L;
        case "BRAKE": { // 刹停后 UL 全程保持跳 → 平顶/斜坡
          jt++;
          if (Math.abs(q.vx) < 30 && jt > 8) { phase = "SJUMP", jt = 0; return UL; }
          if (jt > 120) { phase = "FAIL-BRAKE"; return N; }
          return N; }
        case "SJUMP": {
          jt++;
          if (jt > 8 && q.y > 90 && q.y < 152 && Math.abs(q.vy) < 25 && q.x > 40 && q.x < 170) { mark("FLAT", f, q), phase = "CLIMB", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-SJUMP"; return N; }
          return jt <= sjHold ? UL : N; }
        case "CLIMB": // 45° 爬坡西行→平顶→b0
          if (q.x < 97 && q.y < 135 && Math.abs(q.vx) < 25) { mark("B0", f, q), phase = "SETTLE", jt = 0; return N; }
          if (q.y > 200) { phase = "FAIL-CLIMB"; return N; }
          return L;
        case "SETTLE": {
          jt++;
          if (Math.abs(q.vx) < 6 && jt > 12) {
            const st = w.mechanisms?.pushers?.[0]?.state;
            mark("DONE", f, q);
            done = `b0=${st} stand=(${px(q.x)},${px(q.y)}) f=${f}`;
            phase = "DONE";
          }
          return N; }
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (trace && f % 10 === 0) console.log(`  f${f}: (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)}) ${phase}`);
    if (q.dead || q.dying) { done = `DEAD f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (String(phase).startsWith("FAIL")) { done = `FAIL@${phase} f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (phase === "DONE") break;
  }
  return { marks, done, phase, w };
}

const r = wgRun16({});
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

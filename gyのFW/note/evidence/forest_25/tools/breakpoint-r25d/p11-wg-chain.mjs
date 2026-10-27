// r25d p11：wg 全链 v4 反馈探针（新内核，真实链）
// 出生台走落入池→池底西行→阶梯弹射→塔顶→西落横带→东行扳l0关风→带西行→
// 走落带西缘→落 y352 台→东行→短跳东上 r8 台 y256→跳西上 c4\ 坡→上坡→b0(80,128) 站
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
const marks = [];
const mark = (name, f, p) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(p.x), px(p.y)]); };

let phase = "A", sub = 0, jt = -1, hop2 = -1, hop3 = -1;
let windOffF = -1, b0F = -1, done = "";
for (let f = 0; f < 3400; f++) {
  const inp = f < 90 ? N : (() => {
    const p = w.snapshotPlayer("watergirl");
    switch (phase) {
      case "A": if (p.y > 200) mark("B", f, p), phase = "B"; return L;             // 走落西缘入池
      case "B": if (p.x < 545 && p.y > 250) mark("C", f, p), phase = "C"; return L; // 池底西行
      case "C": if (p.y < 240 && p.x < 470) mark("D", f, p), phase = "D"; return L; // 阶梯弹射上塔
      case "D": if (p.y > 260) mark("E", f, p), phase = "E"; return L;             // 塔顶西行走落
      case "E":                                                                     // 落横带站稳
        if (p.y > 435 && p.y < 460 && Math.abs(p.vy) < 5) mark("F", f, p), phase = "F";
        return N;
      case "F":                                                                     // 东行扳 l0
        if (w.mechanisms.winds[0].state === 0) { windOffF = f; mark("G", f, p); phase = "G"; sub = 0; }
        return R;
      case "G":                                                                     // 折返全速西行（刹停到 <200 再脉冲到带缘）
        if (p.x < 230 && Math.abs(p.vx) < 40) mark("G2", f, p), phase = "G3", sub = 0;
        return L;
      case "G3": {                                                                  // 脉冲踱出带西缘（楔尖 x192）
        sub++;
        if (p.x < 186) { mark("H", f, p), phase = "H"; return N; }
        return sub % 10 < 4 ? L : N;
      }
      case "H": {                                                                   // 落向 y352 台，落稳后东行
        if (p.y > 340 && p.y < 370 && Math.abs(p.vy) < 5) { mark("I", f, p), phase = "I"; }
        return N;
      }
      case "I":                                                                     // y352 台东行至东端
        if (p.x > 138 && Math.abs(p.vx) < 60) { mark("J", f, p), phase = "J", jt = 0; }
        return L;
      case "J": {                                                                   // 短跳东上 r8 台 y256：UR 漂移 jt 帧
        jt++;
        if (p.y < 300 && p.y > 220 && Math.abs(p.vy) < 5) { mark("K", f, p), phase = "K", hop2 = jt; }
        return jt <= 12 ? UR : N;
      }
      case "K": {                                                                   // r8 台西段站位 → 跳西上 c4\ 坡
        if (Math.abs(p.vx) < 20 && p.x < 220) { mark("L", f, p), phase = "L", hop3 = 0; }
        return N;
      }
      case "L": {                                                                   // UL 跳西
        hop3++;
        if (p.y < 200 && p.y > 120 && Math.abs(p.vy) < 5) { mark("M", f, p), phase = "M"; }
        return hop3 <= 16 ? UL : N;
      }
      case "M":                                                                     // 坡面/平台：西行上坡至 b0
        if (p.x < 95 && p.y < 140 && Math.abs(p.vx) < 5) { mark("N", f, p), phase = "N"; }
        return L;
      case "N":                                                                     // b0 站位确认
        if (Math.abs(p.vx) < 3 && p.x < 100) { b0F = f; mark("DONE", f, p); phase = "DONE"; }
        return L;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: N, watergirl: inp });
  const p = w.snapshotPlayer("watergirl");
  if (p.dead || p.dying) { done = `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
  if (phase === "DONE" && f > (b0F ?? 0) + 30) { done = `b0站位 f${b0F} @(${px(p.x)},${px(p.y)}) b0.state=${w.mechanisms.pushers[0].state} p0.y=${px(w.mechSnapshot().platforms[0].y)}`; break; }
}
console.log("marks:", marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("windOffF:", windOffF, " hop2(UR帧):", hop2, " hop3(UL帧):", hop3);
console.log("ended:", done || `f3400 phase=${phase}`);
const fin = w.snapshotPlayer("watergirl");
console.log(`wg final=(${px(fin.x)},${px(fin.y)}) v=(${px(fin.vx)},${px(fin.vy)})`);
const fb = w.snapshotPlayer("fireboy");
console.log(`fb=(${px(fb.x)},${px(fb.y)}) wind=${w.mechanisms.winds[0]?.state} b0=${w.mechanisms.pushers[0].state} p0.y=${px(w.mechSnapshot().platforms[0].y)} p1.x=${px(w.mechSnapshot().platforms[1].x)}`);

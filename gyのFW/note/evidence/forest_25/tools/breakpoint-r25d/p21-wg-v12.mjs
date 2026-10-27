// r25d p21：wg 全链 v12 = 旧入口(A/B/C/CP/CF, p13 已验证) + 块上整跳 + p14 尾段(FW2/T1/T2/T4/S1/R/S2/M/N)
// 走廊全速西落→越 mesa 西尖→水池东斜梯→弹射(~697,204)→西漂→288 ledge(320-352)→东走落阶梯→
// 落 shelf(224-576,448) ~435→刹→UL 整跳飞跃块(384-416,416-448)→shelf 西行→UL 跳 tier(0-160,352)→
// 东行→UR 竖井跳 r8(160-320,256)→西行→UL 短按'\'坡→45°爬→平顶(0-128,128)→b0(80,128)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

export function wgRun(p = {}) {
  const {
    ulT = 14, urS = 12, ulS2 = 4, jumpT = 20, trigBandX = 262, trigTierX = 138, trigR8X = 178,
    trace = false, traceFrom = 0,
  } = p;
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, q) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(q.x), px(q.y)]); };
  let phase = "A", jt = -1, b0F = -1, done = "";
  for (let f = 0; f < 2400; f++) {
    if (p.dbg) p.dbg(f, w, phase);
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (phase) {
        case "A": // 走廊全速西行→走出缘垂落
          if (q.y > 200) { mark("B", f, q), phase = "B"; }
          return L;
        case "B": // 弹射后西漂
          if (q.x < 545 && q.y > 250) { mark("C", f, q), phase = "C"; }
          return L;
        case "C": // 288 ledge(320-352) 站稳
          if (q.y > 245 && q.y < 262 && Math.abs(q.vx) < 5 && q.x > 320 && q.x < 352) { mark("C2", f, q), phase = "CP"; }
          return L;
        case "CP": // 东走落阶梯
          if (q.x > 385) { mark("CF", f, q), phase = "CF"; }
          if (q.y > 330 && q.y < 370 && Math.abs(q.vy) < 8 && q.x > 352 && q.x < 386) { mark("P", f, q); }
          return R;
        case "CF": // 落 shelf(448)：下落段松 R 自然衰减
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 384) { mark("F2", f, q), phase = "FWB", jt = 0; }
          return N;
        case "FWB": // 刹停
          if (Math.abs(q.vx) < 20 && jt > 15) { mark("BRK", f, q), phase = "JBLK", jt = 0; }
          if (jt++ > 120) { phase = "FAIL-FWB"; return N; }
          return N;
        case "JBLK": { // UL 整跳→落 352 平台(stair+pillar, x288-384)
          jt++;
          if (jt > 15 && q.y > 300 && q.y < 335 && Math.abs(q.vy) < 8 && q.x > 285 && q.x < 385) { mark("JB", f, q), phase = "PLAT", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-JBLK"; return N; }
          return jt <= 18 ? UL : N;
        }
        case "PLAT": // 平台西行至 pillar 西缘
          if (q.x < 312) { phase = "PLAT2", jt = 0; return N; }
          return L;
        case "PLAT2": // 刹停后脉冲走出 pillar 西缘(288)→落 shelf
          jt++;
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 222 && q.x < 290) { mark("SHF", f, q), phase = "FW2", jt = 0; return N; }
          if (q.y > 690 && q.y < 725 && Math.abs(q.vy) < 8 && q.x > 190 && q.x < 292) { mark("ISL", f, q), phase = "FAIL-PLAT-ISL"; return N; }
          if (jt > 150) { phase = "FAIL-PLAT2"; return N; }
          return jt % 6 < 2 ? L : N;
        case "FW2": // shelf 西行
          if (q.x < trigBandX) { phase = "T1", jt = 0; return N; }
          return L;
        case "T1": { // 刹车后 UL 跳 tier(0-160,352)
          jt++;
          if (Math.abs(q.vx) < 160 && jt > 6) { phase = "T2", jt = 0; return UL; }
          if (jt++ > 90) { phase = "FAIL-T1"; return N; }
          return N;
        }
        case "T2": {
          jt++;
          if (jt > 10 && q.y > 300 && q.y < 335 && Math.abs(q.vy) < 10 && q.x > 20 && q.x < 162) { mark("T3", f, q), phase = "T4", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-T2"; return N; }
          return jt <= jumpT ? UL : N;
        }
        case "T4": // tier 东行至东缘
          if (q.x > trigTierX) { phase = "S1", jt = 0; return UR; }
          return L;
        case "S1": { // UR 竖井跳→落 r8 西(160-320,256)
          jt++;
          if (jt > 10 && q.y > 205 && q.y < 235 && Math.abs(q.vy) < 10 && q.x > 160 && q.x < 300) { mark("R", f, q), phase = "R", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-S1"; return N; }
          return jt <= urS ? UR : N;
        }
        case "R": // r8 西行至西缘
          if (q.x < trigR8X) { phase = "S2", jt = 0; return UL; }
          return L;
        case "S2": { // UL 短按→落 '\'坡斜面(128-160,128-160)
          jt++;
          if (jt > 6 && q.y > 95 && q.y < 145 && Math.abs(q.vy) < 25 && q.x > 125 && q.x < 168) { mark("M", f, q), phase = "M"; }
          if (jt > 90) { phase = "FAIL-S2"; return N; }
          return jt <= ulS2 ? UL : N;
        }
        case "M": // 45° 爬坡→平顶(0-128,128)→b0
          if (q.x < 100 && q.y < 135 && Math.abs(q.vx) < 25) { mark("N", f, q), phase = "N"; }
          if (q.y > 200) { phase = "FAIL-M"; }
          return L;
        case "N":
          if (Math.abs(q.vx) < 6 && q.x < 100 && q.y < 135) { b0F = f; mark("DONE", f, q), phase = "DONE"; }
          return N;
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const q = w.snapshotPlayer("watergirl");
    if (trace && f > traceFrom && f % 10 === 0) console.log(`  f${f}: (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)}) ${q.anim} ph=${phase}`);
    if (q.dead || q.dying) { done = `DEAD f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (phase === "DONE" && f > (b0F ?? 0) + 20) {
      done = `b0站位 f${b0F} @(${px(q.x)},${px(q.y)}) b0=${w.mechanisms.pushers[0].state}`;
      break;
    }
    if (String(phase).startsWith("FAIL")) { done = `FAIL@${phase} f${f} @(${px(q.x)},${px(q.y)})`; break; }
  }
  return { marks, done, phase, w, b0F };
}

const r = wgRun({ trace: true, traceFrom: 200 });
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

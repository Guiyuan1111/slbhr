// r25d p24：wg 全链 v13
// 旧入口(已验证)：A 走廊全速西落→B 水池弹射(697,204)→C 西漂上 288 ledge(335.6)
// 中段：CP 东走落阶梯→CF 落 shelf 东(435)→东移→UL短跳上 384 楼梯→西行走楔→pillar(288-320,352)→
//       西缘走落→shelf 西(~265)→T1/T2 UL 跳 tier(0-160,352)→T4/S1 UR 跳 terrace(192-288,256)→
// 尾段：R2 西缘→SJUMP UL 整跳→平顶(0-128,128)→M 爬→b0(80,128)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

export function wgRun(p = {}) {
  const {
    jumpT = 24, urS = 24, sjumpT = 20, jstairT = 20, trigBandX = 262, trigTierX = 138,
    trigTerrX = 222, trigPilX = 302,
    trace = false, traceFrom = 0,
  } = p;
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, q) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(q.x), px(q.y)]); };
  let phase = "A", jt = -1, sub = 0, b0F = -1, done = "";
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
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 384) { mark("F2", f, q), phase = "WALK2", jt = 0; }
          return N;
        case "WALK2": // 东移到 x>448（给楼梯跳留净空）
          if (q.x > 448) { phase = "BRK2", jt = 0; return N; }
          return R;
        case "BRK2": // 刹停
          if (Math.abs(q.vx) < 20 && jt > 15) { mark("BRK", f, q), phase = "JSTAIR", jt = 0; }
          if (jt++ > 120) { phase = "FAIL-BRK2"; return N; }
          return N;
        case "JSTAIR": { // UL 短跳上 384 楼梯(352-416,384)
          jt++;
          if (jt > 12 && q.y > 300 && q.y < 335 && Math.abs(q.vy) < 8 && q.x > 340 && q.x < 412) { mark("ST", f, q), phase = "STAIR2", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-JSTAIR"; return N; }
          return jt <= jstairT ? UL : N;
        }
        case "STAIR2": // 楼梯西行→楔→pillar(288-320,352)→西缘
          if (q.x < trigPilX) { phase = "WALKOFF", jt = 0, sub = 0; return N; }
          return L;
        case "WALKOFF": // 刹停后脉冲走出 pillar 西缘(288)→落 shelf 西
          jt++, sub++;
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 222 && q.x < 292) { mark("SHF", f, q), phase = "FW2", jt = 0; return N; }
          if (q.y > 690 && q.y < 725 && Math.abs(q.vy) < 8 && q.x > 190 && q.x < 292) { phase = "FAIL-WALKOFF-ISL"; return N; }
          if (jt > 220) { phase = "FAIL-WALKOFF"; return N; }
          if (jt < 40) return N; // 先刹停
          return sub % 6 < 2 ? L : N;
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
        case "S1": { // UR 长跳越竖井→落 terrace(192-288,256)
          jt++;
          if (jt > 10 && q.y > 205 && q.y < 240 && Math.abs(q.vy) < 10 && q.x > 190 && q.x < 262) { mark("R", f, q), phase = "R2", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-S1"; return N; }
          return jt <= urS ? UR : N;
        }
        case "R2": // terrace 西行至跳点
          if (q.x < trigTerrX) { phase = "SJUMP", jt = 0; return UL; }
          return L;
        case "SJUMP": { // UL 整跳→落平顶(0-128,128) 或 '\'坡
          jt++;
          if (jt > 12 && q.y > 85 && q.y < 150 && Math.abs(q.vy) < 30 && q.x > 55 && q.x < 172) { mark("M", f, q), phase = "M"; return L; }
          if (jt > 120) { phase = "FAIL-SJUMP"; return N; }
          return jt <= sjumpT ? UL : N;
        }
        case "M": // 平顶西行→b0
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

const r = wgRun({ trace: true, traceFrom: 350 });
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

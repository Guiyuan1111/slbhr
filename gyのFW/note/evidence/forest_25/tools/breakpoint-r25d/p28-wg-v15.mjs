// r25d p28：wg 全链 v15 = 老西线入口(已验证) + 口袋 shelf 三级跨越 + p24 尾段
// A 走廊全速西落→B 池(水仅14px)→C 池西北漂上 288 ledge(335.6)→CP 东走落阶梯→CF 落 shelf 东(435)→
// HB UL 小跳上块(384-416,416)→WB 西落 shelf(378)→WW 楔面西上→PH pillar 角 UL 跳上柱顶(288-320,352)→
// PWO 西缘走落→shelf 西(224-288,448)→UL 跳 tier(0-160,352)→UR 跳 terrace(192-288,256)→
// UL 整跳平顶(0-128,128)→b0(80,128)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

export function wgRun(p = {}) {
  const {
    hbT = 7, phT = 10, jumpT = 24, urS = 24, sjumpT = 20,
    trigBandX = 262, trigTierX = 138, trigTerrX = 222,
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
        case "A": // 走廊全速西行→走出西端垂落
          if (q.y > 200) { mark("B", f, q), phase = "B"; }
          return L;
        case "B": // 持L落池→池底西行上西坡→288 ledge
          if (q.x < 545 && q.y > 250) { mark("C", f, q), phase = "C"; }
          return L;
        case "C": // 288 ledge 站稳
          if (q.y > 245 && q.y < 262 && Math.abs(q.vx) < 5 && q.x > 320 && q.x < 352) { mark("C2", f, q), phase = "CP"; }
          return L;
        case "CP": // 东走落阶梯
          if (q.x > 385) { mark("CF", f, q), phase = "CF"; }
          if (q.y > 330 && q.y < 370 && Math.abs(q.vy) < 8 && q.x > 352 && q.x < 386) { mark("P", f, q); }
          return R;
        case "CF": // 落 shelf 东：下落段松 R 自然衰减
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 384) { mark("F2", f, q), phase = "HB", jt = 0; }
          return N;
        case "HB": { // 东移净空→刹停→UL 跳上块顶(384-416,416)
          jt++;
          if (jt > 25 && q.y > 370 && q.y < 398 && Math.abs(q.vy) < 10 && q.x > 385 && q.x < 416) { mark("BT", f, q), phase = "WB", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-HB"; return N; }
          if (jt < 30) return q.x < 448 ? R : N; // 先东移净空
          if (jt < 45) return N; // 刹停
          return jt <= 45 + hbT ? UL : N;
        }
        case "WB": // 块顶西行，走出西缘(384)落 shelf
          if (q.y > 405 && q.y < 428 && Math.abs(q.vy) < 10 && q.x > 352 && q.x < 384) { mark("WS", f, q), phase = "WW", jt = 0; return N; }
          if (jt++ > 150) { phase = "FAIL-WB"; return N; }
          return L;
        case "WW": // 楔面(320-352,416-448 hyp)西上至 pillar 角
          if (q.x < 338 && q.y > 385) { phase = "PH", jt = 0; return UL; }
          if (q.y > 405 && q.y < 428 && Math.abs(q.vy) < 10 && q.x < 325) { phase = "PH", jt = 0; return UL; }
          return L;
        case "PH": { // UL 小跳上柱顶(288-320,352)；过冲落 shelf 西亦可
          jt++;
          if (jt > 10 && q.y > 300 && q.y < 335 && Math.abs(q.vy) < 10 && q.x > 284 && q.x < 324) { mark("PT", f, q), phase = "PWO", jt = 0, sub = 0; return N; }
          if (jt > 10 && q.y > 395 && q.y < 428 && Math.abs(q.vy) < 10 && q.x > 222 && q.x < 292) { mark("SW", f, q), phase = "FW2", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-PH"; return N; }
          return jt <= phT ? UL : N;
        }
        case "PWO": // 柱顶刹停后脉冲走出西缘(288)→落 shelf 西
          jt++, sub++;
          if (q.y > 395 && q.y < 428 && Math.abs(q.vy) < 8 && q.x > 222 && q.x < 292) { mark("SW", f, q), phase = "FW2", jt = 0; return N; }
          if (q.y > 690 && q.y < 725 && Math.abs(q.vy) < 8 && q.x > 190 && q.x < 292) { phase = "FAIL-PWO-ISL"; return N; }
          if (jt > 220) { phase = "FAIL-PWO"; return N; }
          if (jt < 35) return N;
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

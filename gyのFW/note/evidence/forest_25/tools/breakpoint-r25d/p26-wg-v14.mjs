// r25d p26：wg 全链 v14（全顺风，无风柱对抗）
// A 走廊全速西落→B 池东斜梯弹射(697,204)→B2 持R落柱顶(768-800,288)（若回池则浮泳东出）→
// CE 柱顶东跑走跳→长坠→shore(896-1024,864)→岸西缘站跳→h0 吊板(637-739,744)→全程L西跑发射+
// 发射中按跳→岛台(192-288,736)→UL 跳 608→576→544→UR 满跳 shelf 西(224-288,448)→
// UL 跳 tier(0-160,352)→UR 跳 terrace(192-288,256)→UL 整跳平顶(0-128,128)→b0(80,128)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

export function wgRun(p = {}) {
  const {
    jumpShore = 20, flingJ = 2, hop608 = 12, trig608X = 136, hop576 = 8, trig576X = 104,
    jumpBW = 28, jumpT = 24, urS = 24, sjumpT = 20,
    trigBandX = 262, trigTierX = 138, trigTerrX = 222,
    trace = false, traceFrom = 0,
  } = p;
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, q) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(q.x), px(q.y)]); };
  let phase = "A", jt = -1, sub = 0, b0F = -1, done = "";
  for (let f = 0; f < 3600; f++) {
    if (p.dbg) p.dbg(f, w, phase);
    const inp = f < 90 ? N : (() => {
      const q = w.snapshotPlayer("watergirl");
      switch (phase) {
        case "A": // 走廊全速西行→走出西端垂落
          if (q.y > 200) { mark("B", f, q), phase = "B"; }
          return L;
        case "B": // 持L落池(水仅14px深)→池底站稳
          if (q.y > 288 && q.y < 332 && Math.abs(q.vy) < 10 && q.x > 560 && q.x < 755) { mark("P", f, q), phase = "B2", jt = 0; return N; }
          return L;
        case "B2": // 持R池底东行→双斜梯爬出→直接上 mesa 顶(800,256)
          if (q.y > 205 && q.y < 238 && Math.abs(q.vy) < 8 && q.x > 795 && q.x < 1030) { mark("ME", f, q), phase = "DESC", jt = 0, sub = 0; return N; }
          if (jt++ > 300) { phase = "FAIL-B2"; return N; }
          return R;
        case "DESC": { // mesa 顶风带：持R顶风振荡，风谷(sin<0)单次 UR 跳跨越大风区
          jt++, sub++;
          const m = (w.simTimeS ?? 0) % (2 * Math.PI);
          if (sub > 2 && m > 3.6 && m < 5.7) { mark("TROUGH", f, q), phase = "JUMPD", jt = 0, sub = 0; return UR; }
          if (jt > 600) { phase = "FAIL-DESC"; return N; }
          return R;
        }
        case "JUMPD": { // 风谷滞空跳：空中 R 加速漂移过 x1024
          jt++, sub++;
          if (q.y > 240 && Math.abs(q.vy) < 8 && q.x > 1015) { mark("D288", f, q), phase = "DESC2", jt = 0; return R; }
          if (jt > 30 && q.y > 205 && q.y < 238 && Math.abs(q.vy) < 8) { mark("BACK", f, q), phase = "DESC", jt = 0; return R; }
          if (sub > 240) { phase = "FAIL-JUMPD"; return N; }
          return jt <= 2 ? UR : R;
        }
        case "DESC2": { // '\'坡/288 台/坑/384 台/东阶梯→板带：一路 R
          jt++;
          if (q.y > 725 && q.y < 748 && Math.abs(q.vy) < 8 && q.x > 990) { mark("BAND", f, q), phase = "BANDW", jt = 0; return N; }
          if (jt > 600) { phase = "FAIL-DESC2"; return N; }
          return R;
        }
        case "FALLE": // 备用：长坠→shore 或 band
          jt++;
          if (q.y > 725 && q.y < 748 && Math.abs(q.vy) < 8 && q.x > 990) { mark("BAND", f, q), phase = "BANDW", jt = 0; return N; }
          if (q.y > 820 && q.y < 850 && Math.abs(q.vy) < 8 && q.x > 890 && q.x < 1024) { mark("SHORE", f, q), phase = "SHORE", jt = 0; return N; }
          if (q.y > 855 && q.x < 896) { phase = "FAIL-FALLE-GREEN"; return N; }
          if (jt > 200) { phase = "FAIL-FALLE"; return N; }
          return N;
        case "BANDW": // band 西行至西缘(992)落 shore
          if (q.y > 820 && q.y < 850 && Math.abs(q.vy) < 8 && q.x > 890 && q.x < 1024) { mark("SHORE", f, q), phase = "SHORE", jt = 0; return N; }
          if (jt++ > 240) { phase = "FAIL-BANDW"; return N; }
          return L;
        case "SHORE": // 刹停
          if (Math.abs(q.vx) < 15 && jt > 15) { phase = "SHORE2", jt = 0; }
          if (jt++ > 120) { phase = "FAIL-SHORE"; return N; }
          return N;
        case "SHORE2": // 西行至岸西缘
          if (q.x < 897) { phase = "JUMPB", jt = 0; return N; }
          return L;
        case "JUMPB": { // 岸缘站跳满跳→h0 吊板
          jt++;
          if (jt > 15 && q.y > 690 && q.y < 765 && q.x > 620 && q.x < 760 && Math.abs(q.vy) < 60) { mark("BOARD", f, q), phase = "BOARD", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-JUMPB"; return N; }
          return jt <= jumpShore ? UL : N;
        }
        case "BOARD": // 全程 L 西跑发射
          if (q.x < 630 && q.y < 700) { mark("LAUNCH", f, q), phase = "FLING", jt = 0; return UR; }
          return L;
        case "FLING": { // 发射中按跳→弹道落岛台
          jt++;
          if (jt > 30 && q.y > 690 && q.y < 725 && Math.abs(q.vy) < 12 && q.x > 188 && q.x < 292) { mark("ISLAND", f, q), phase = "ISL2", jt = 0; return N; }
          if (jt > 200) { phase = "FAIL-FLING"; return N; }
          return jt <= flingJ ? UR : N;
        }
        case "ISL2": // 岛台刹停
          if (Math.abs(q.vx) < 15 && jt > 10) { mark("ISL3", f, q), phase = "HOP608", jt = 0; }
          if (jt++ > 150) { phase = "FAIL-ISL2"; return N; }
          return N;
        case "HOP608": { // UL 跳西上 608 台(0-192)
          jt++;
          if (jt > 10 && q.y > 560 && q.y < 590 && Math.abs(q.vy) < 10 && q.x > 40 && q.x < 196) { mark("S608", f, q), phase = "STAIR", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-HOP608"; return N; }
          return jt <= hop608 ? UL : N;
        }
        case "STAIR": // 608 西行
          if (q.x < trig608X) { phase = "HOP576", jt = 0; return UL; }
          return L;
        case "HOP576": {
          jt++;
          if (jt > 8 && q.y > 528 && q.y < 560 && Math.abs(q.vy) < 10 && q.x > 30 && q.x < 132) { mark("S576", f, q), phase = "STAIR2", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-HOP576"; return N; }
          return jt <= hop576 ? UL : N;
        }
        case "STAIR2": // 576 西行
          if (q.x < trig576X) { phase = "HOP544", jt = 0; return UL; }
          return L;
        case "HOP544": {
          jt++;
          if (jt > 8 && q.y > 496 && q.y < 528 && Math.abs(q.vy) < 10 && q.x > 20 && q.x < 100) { mark("S544", f, q), phase = "JUMPBW", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-HOP544"; return N; }
          return jt <= hop576 ? UL : N;
        }
        case "JUMPBW": { // (80,544) UR 满跳→shelf 西(224-288,448)
          jt++;
          if (jt > 20 && q.y > 400 && q.y < 432 && Math.abs(q.vy) < 10 && q.x > 200 && q.x < 292) { mark("BW", f, q), phase = "BW3", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-JUMPBW"; return N; }
          return jt <= jumpBW ? UR : N;
        }
        case "BW3": // shelf 西刹停（西缘 224 注意）
          if (Math.abs(q.vx) < 15 && jt > 15) { phase = "BW4", jt = 0; }
          if (jt++ > 150) { phase = "FAIL-BW3"; return N; }
          return N;
        case "BW4": // 西行至 tier 跳点
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

const r = wgRun({ trace: true, traceFrom: 150 });
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

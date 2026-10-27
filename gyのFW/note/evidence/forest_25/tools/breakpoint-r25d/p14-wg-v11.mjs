// r25d p14：wg 全链 v11（复用 fb 东线入西口袋）
// 出生台西行→缓速垂落 mesa(800-1024,256)→东行东降阶梯→板带(992-1248,768)→西行落东岸(896-1024,864)→
// 岸西缘站跳满跳→h0 吊板(637-739,744)→全程 L 西跑发射+发射中按跳→岛台(192-288,736)→
// UL 跳 D楔/608 台(0-192)→576→544 台阶西上→UR 满跳带西(192-288,448)→UL 跳 tier(0-160,352)→
// 东行 UR 竖井跳→r8 西(256)→UL 短按上'\'坡→45° 爬→平顶(0-128,128)→b0(80,128) 按住
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

export function wgRun(p = {}) {
  const {
    trigCorrX = 856, jumpShore = 20, trigIslandX = 210,
    trig608X = 136, trig576X = 104, jump544 = 28,
    trigBWX = 262, jumpT = 20, trigTierX = 138, urS = 12, trigR8X = 178, ulS2 = 4,
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
        case "A": // 走廊西行
          if (q.x < trigCorrX) { phase = "FW1", jt = 0; return N; }
          return L;
        case "FW1": // 刹车停稳
          if (Math.abs(q.vx) < 15) { phase = "FW2", sub = 0; }
          if (jt++ > 120) { phase = "FAIL-FW1"; return N; }
          return N;
        case "FW2": { // 脉冲微移走出缘（近垂直垂落 mesa）
          sub++;
          if (q.vy > 30) { phase = "DROP"; return N; }
          if (sub > 400) { phase = "FAIL-FW2"; return N; }
          return sub % 4 < 1 ? L : N;
        }
        case "DROP": // 垂落 mesa (800-1024, 256)
          if (q.y > 205 && q.y < 238 && Math.abs(q.vy) < 8 && q.x > 795 && q.x < 845) { mark("ME", f, q), phase = "DESC"; jt = 0; }
          if (jt++ > 150) { phase = "FAIL-DROP"; return N; }
          return N;
        case "DESC": { // mesa 西尖：等风谷（sin(simT)<0 下降段）→冲刺
          jt++;
          if (q.y > 245 && q.y < 262 && Math.abs(q.vy) < 8 && q.x < 800) { phase = "FAIL-DESC-WEST"; return N; }
          if (jt > 1200) { phase = "FAIL-DESC"; return N; }
          const m = (w.simTimeS ?? 0) % (2 * Math.PI);
          if (m > Math.PI - 0.3 && m < Math.PI + 1.0) { mark("TROUGH", f, q), phase = "SPRINT", jt = 0; return R; }
          return N;
        }
        case "SPRINT": { // 满速 R 冲刺越 mesa 顶（惯性穿东风带）
          jt++;
          if (q.y > 240 && q.y < 262 && Math.abs(q.vy) < 8 && q.x > 1015) { mark("D288", f, q), phase = "DESC2", jt = 0; return R; }
          if (jt > 90 && Math.abs(q.vx) < 15 && q.x < 1010 && q.y > 205 && q.y < 238) { mark("STALLED", f, q), phase = "DESC", jt = 0; return N; }
          if (jt > 300) { phase = "FAIL-SPRINT"; return N; }
          return R;
        }
        case "DESC2": { // '\'坡/288 台/坑/384 台/东缘/544/576/608/板带：一路 R
          jt++;
          if (q.y > 725 && q.y < 748 && Math.abs(q.vy) < 8 && q.x > 1100) { mark("BAND", f, q), phase = "BW2", jt = 0; return N; }
          if (jt > 600) { phase = "FAIL-DESC2"; return N; }
          return R;
        }
        case "BW2": // 板带西行至西缘 (992) 落东岸
          if (q.y > 820 && q.y < 850 && Math.abs(q.vy) < 8 && q.x > 890 && q.x < 1024) { mark("SHORE", f, q), phase = "SHORE", jt = 0; return N; }
          if (jt++ > 300) { phase = "FAIL-BW2"; return N; }
          return L;
        case "SHORE": // 东岸刹停→西行至西缘
          if (Math.abs(q.vx) < 15 && jt > 20) { phase = "SHORE2", jt = 0; }
          if (jt++ > 120) { phase = "FAIL-SHORE"; return N; }
          return N;
        case "SHORE2": // 西行至缘
          if (q.x < 900) { phase = "JUMPB", jt = 0; return N; }
          return L;
        case "JUMPB": { // 岸缘站跳满跳→h0 吊板
          jt++;
          if (jt > 15 && q.y > 690 && q.y < 765 && q.x > 620 && q.x < 760 && Math.abs(q.vy) < 60) { mark("BOARD", f, q), phase = "BOARD", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-JUMPB"; return N; }
          return jt <= jumpShore ? UL : N;
        }
        case "BOARD": // 全程 L 西跑发射（r25d 板段已证技术）
          if (q.x < 630 && q.y < 700) { mark("LAUNCH", f, q), phase = "FLING", jt = 0; return UR; }
          return L;
        case "FLING": { // 发射中按跳（vy 置 -496）→ 弹道落岛台
          jt++;
          if (jt > 30 && q.y > 690 && q.y < 725 && Math.abs(q.vy) < 12 && q.x > 188 && q.x < 292) { mark("ISLAND", f, q), phase = "ISL2", jt = 0; return N; }
          if (jt > 200) { phase = "FAIL-FLING"; return N; }
          return jt <= 2 ? UR : N;
        }
        case "ISL2": // 岛台刹停
          if (Math.abs(q.vx) < 15 && jt > 10) { mark("ISL3", f, q), phase = "HOP608", jt = 0; }
          if (jt++ > 150) { phase = "FAIL-ISL2"; return N; }
          return N;
        case "HOP608": { // UL 跳西上 D楔/608 台 (0-192, 608)
          jt++;
          if (jt > 10 && q.y > 560 && q.y < 590 && Math.abs(q.vy) < 10 && q.x > 40 && q.x < 196) { mark("S608", f, q), phase = "STAIR", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-HOP608"; return N; }
          return jt <= 12 ? UL : N;
        }
        case "STAIR": // 608 西行→跳 576→跳 544
          if (q.x < trig608X) { phase = "HOP576", jt = 0; return UL; }
          return L;
        case "HOP576": {
          jt++;
          if (jt > 8 && q.y > 528 && q.y < 560 && Math.abs(q.vy) < 10 && q.x > 30 && q.x < 132) { mark("S576", f, q), phase = "STAIR2", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-HOP576"; return N; }
          return jt <= 8 ? UL : N;
        }
        case "STAIR2": // 576 西行→跳 544
          if (q.x < trig576X) { phase = "HOP544", jt = 0; return UL; }
          return L;
        case "HOP544": {
          jt++;
          if (jt > 8 && q.y > 496 && q.y < 528 && Math.abs(q.vy) < 10 && q.x > 20 && q.x < 100) { mark("S544", f, q), phase = "JUMPBW", jt = 0; return N; }
          if (jt > 120) { phase = "FAIL-HOP544"; return N; }
          return jt <= 8 ? UL : N;
        }
        case "JUMPBW": { // (80,544) UR 满跳→带西 (192-288, 448)
          jt++;
          if (jt > 20 && q.y > 400 && q.y < 432 && Math.abs(q.vy) < 10 && q.x > 188 && q.x < 290) { mark("BW", f, q), phase = "BW3", jt = 0; return N; }
          if (jt > 150) { phase = "FAIL-JUMPBW"; return N; }
          return jt <= jump544 ? UR : N;
        }
        case "BW3": // 带西刹停（东有墙 288）
          if (Math.abs(q.vx) < 15 && jt > 15) { phase = "BW4", jt = 0; }
          if (jt++ > 150) { phase = "FAIL-BW3"; return N; }
          return N;
        case "BW4": // 西行至 tier 跳点
          if (q.x < trigBWX) { phase = "T1", jt = 0; return N; }
          return L;
        case "T1": { // 刹车后 UL 跳 tier
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
        case "S1": { // UR 竖井跳→落 r8 西
          jt++;
          if (jt > 10 && q.y > 205 && q.y < 235 && Math.abs(q.vy) < 10 && q.x > 160 && q.x < 300) { mark("R", f, q), phase = "R", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-S1"; return N; }
          return jt <= urS ? UR : N;
        }
        case "R": // r8 西行至西缘
          if (q.x < trigR8X) { phase = "S2", jt = 0; return UL; }
          return L;
        case "S2": { // UL 短按→落 '\'坡斜面
          jt++;
          if (jt > 6 && q.y > 95 && q.y < 145 && Math.abs(q.vy) < 25 && q.x > 125 && q.x < 168) { mark("M", f, q), phase = "M"; }
          if (jt > 90) { phase = "FAIL-S2"; return N; }
          return jt <= ulS2 ? UL : N;
        }
        case "M": // 45° 爬坡→平顶→b0
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
      done = `b0站位 f${b0F} @(${px(q.x)},${px(q.y)}) b0=${w.mechanisms.pushers[0].state} p0=${JSON.stringify(w.mechSnapshot().platforms[0])}`;
      break;
    }
    if (String(phase).startsWith("FAIL")) { done = `FAIL@${phase} f${f} @(${px(q.x)},${px(q.y)})`; break; }
  }
  return { marks, done, phase, w, b0F };
}

const r = wgRun({ trace: true, traceFrom: 90 });
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

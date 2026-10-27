// r25d p11b：wg 全链 v4（修正：台沿 UR 跳回塔三级）+ UR 帧数扫描
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };

function run(urHold, log = false) {
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, p) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(p.x), px(p.y)]); };
  let phase = "A", sub = 0, jt = -1, hop2 = -1, hop3 = -1, windOffF = -1, b0F = -1, done = "";
  for (let f = 0; f < 3400; f++) {
    const inp = f < 90 ? N : (() => {
      const p = w.snapshotPlayer("watergirl");
      switch (phase) {
        case "A": if (p.y > 200) mark("B", f, p), phase = "B"; return L;
        case "B": if (p.x < 545 && p.y > 250) mark("C", f, p), phase = "C"; return L;
        case "C": { // 阶梯弹射，落到台沿站稳
          if (p.y > 245 && p.y < 262 && Math.abs(p.vx) < 5 && p.x > 320 && p.x < 352) { mark("C2", f, p), phase = "C2", jt = 0; }
          return L;
        }
        case "C2": { // 台沿 UR 跳回塔三级
          jt++;
          if (p.y > 175 && p.y < 215 && Math.abs(p.vy) < 5 && p.x > 435 && p.x < 495) { mark("D", f, p), phase = "D"; }
          return jt <= urHold ? UR : N;
        }
        case "D": { // 塔顶脉冲踱出西缘（低速垂落横带，满速会落回台沿）
          sub++;
          if (p.y > 240) mark("E", f, p), phase = "E";
          return sub % 10 < 3 ? L : N;
        }
        case "E":
          if (p.y > 395 && p.y < 428 && Math.abs(p.vy) < 5) mark("F", f, p), phase = "F";
          return N;
        case "F":
          if (w.mechanisms.winds[0].state === 0) { windOffF = f; mark("G", f, p); phase = "G"; sub = 0; }
          return R;
        case "G":
          if (p.x < 230 && Math.abs(p.vx) < 40) mark("G3", f, p), phase = "G3", sub = 0;
          return L;
        case "G3": {
          sub++;
          if (p.x < 186) { mark("H", f, p), phase = "H"; return N; }
          return sub % 10 < 4 ? L : N;
        }
        case "H":
          if (p.y > 300 && p.y < 333 && Math.abs(p.vy) < 5) { mark("I", f, p), phase = "I"; }
          return N;
        case "I":
          if (p.x > 138 && Math.abs(p.vx) < 60) { mark("J", f, p), phase = "J", jt = 0; }
          return L;
        case "J": {
          jt++;
          if (p.y < 300 && p.y > 215 && Math.abs(p.vy) < 5) { mark("K", f, p), phase = "K", hop2 = jt; }
          return jt <= 12 ? UR : N;
        }
        case "K":
          if (Math.abs(p.vx) < 20 && p.x < 230) { mark("L", f, p), phase = "L", hop3 = 0; }
          return N;
        case "L": {
          hop3++;
          if (p.y < 200 && p.y > 118 && Math.abs(p.vy) < 5) { mark("M", f, p), phase = "M"; }
          return hop3 <= 16 ? UL2 : N;
        }
        case "M":
          if (p.x < 95 && p.y < 140 && Math.abs(p.vx) < 5) { mark("N", f, p), phase = "N"; }
          return L;
        case "N":
          if (Math.abs(p.vx) < 3 && p.x < 100) { b0F = f; mark("DONE", f, p); phase = "DONE"; }
          return L;
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const p = w.snapshotPlayer("watergirl");
    if (f > 360 && f < 620 && f % 10 === 0) console.log(`  f${f}: (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} ph=${phase}`);
    if (p.dead || p.dying) { done = `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (phase === "DONE" && f > (b0F ?? 0) + 20) {
      done = `b0站位 f${b0F} @(${px(p.x)},${px(p.y)}) b0=${w.mechanisms.pushers[0].state} p0.y=${px(w.mechSnapshot().platforms[0].y)}`;
      break;
    }
  }
  return { marks, windOffF, hop2, hop3, done, phase, w };
}
const UL2 = { up: true, left: true, right: false };

for (const ur of [28]) {
  const r = run(ur);
  console.log(`UR=${ur}: ${r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" ")}`);
  console.log(`   windOff=${r.windOffF} hop2=${r.hop2} hop3=${r.hop3} ended=${r.done || r.phase}`);
}

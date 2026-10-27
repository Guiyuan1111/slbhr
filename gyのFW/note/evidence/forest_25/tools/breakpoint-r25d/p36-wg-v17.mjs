// v17：完整 wg 西线（终点=wg 门 208,900）
// spawn→板西行→坠池→池西爬→pin(557.9)→HOP→T224(488.5)→东行下阶梯→288台[480,544]
// →288西缘(495.4)走落长飞→天窗井[111.4,176.6]→p1盖[96,192]x736→(待l1)→前厅→门(208,900)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const U = { up: true, left: false, right: false };

export function wgRun17(p = {}) {
  const { trace = false, pulL = 4, idleWait = 0 } = p;
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, q) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(q.x), px(q.y)]); };
  let phase = "SW", jt = -1, done = "";
  for (let f = 0; f < 3600; f++) {
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
          if (jt > 4 && q.y > 180 && q.y < 215 && Math.abs(q.vy) < 12 && q.x > 445 && q.x < 512) { mark("T224", f, q), phase = "E288", jt = 0; return N; }
          if (jt > 4 && q.y > 215 && q.y < 240 && Math.abs(q.vy) < 12 && q.x > 448 && q.x < 513) { mark("T256", f, q), phase = "E288", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL-HOP"; return N; }
          return jt <= 24 ? U : (jt <= 44 ? L : N); }
        case "E288": { // 东行下 224hyp→256top→256hyp→288top[480,544]
          jt++;
          if (q.x > 490 && q.y > 251 && q.y < 258) { mark("T288", f, q), phase = "W288", jt = 0; return N; }
          if (q.x < 480 && q.y > 240) { mark("T288", f, q), phase = "W288", jt = 0; return L; }
          if (jt > 400) { phase = "FAIL-E288"; return N; }
          return (f % 4) < 3 ? R : N; }
        case "W288": { // 288 台西行到西缘(495.4)直接走落（保持 L）
          jt++;
          if (q.x < 497) { mark("WOFF", f, q), phase = "FALL2", jt = 0; return L; }
          if (jt > 300) { phase = "FAIL-W288"; return N; }
          return L; }
        case "FALL2": { // 长漂移飞行→p1 盖[96,192]x736 / [192,288]x736 台 / 直接穿井
          jt++;
          if (q.y > 690 && q.y < 725 && Math.abs(q.vy) < 12 && q.x > 99 && q.x < 190) { mark("P1", f, q), phase = idleWait > 0 ? "WAITP1" : "ONP1", jt = 0; return N; }
          if (q.y > 690 && q.y < 725 && Math.abs(q.vy) < 12 && q.x >= 190 && q.x < 286) { mark("SLAB", f, q), phase = "WSLAB", jt = 0; return N; }
          if (q.y > 850 && q.x > 40 && q.x < 250) { mark("ANTE", f, q), phase = "DOORW", jt = 0; return N; }
          if (jt > 400) { phase = "FAIL-FALL2"; return N; }
          return L; }
        case "ONP1": // 已站 p1 盖（联合磁带中此处等 fb 拉 l1）；探针直接验证落点
          mark("ONP1", f, q);
          done = `ON-P1 f=${f} pos=(${px(q.x)},${px(q.y)}) — 等待 l1 开盖后坠落`;
          phase = "DONE";
          return N;
        case "WAITP1": {
          jt++;
          if (jt > idleWait) { phase = "FALLP1"; jt = 0; }
          return N; }
        case "FALLP1": // 模拟盖已开：直接下坠（真机由 p1 西移触发）
          if (q.y > 850 && q.x > 40 && q.x < 250) { mark("ANTE", f, q), phase = "DOORW", jt = 0; return N; }
          return N;
        case "WSLAB": // [192,288] 台西行走落天窗
          if (q.x < 205) { mark("WOFF2", f, q), phase = "FALL3", jt = 0; return L; }
          return L;
        case "FALL3":
          if (q.y > 850 && q.x > 40 && q.x < 250) { mark("ANTE", f, q), phase = "DOORW", jt = 0; return N; }
          if (jt++ > 300) { phase = "FAIL-FALL3"; return N; }
          return N;
        case "DOORW": { // 前厅东行到门 (208,900)
          jt++;
          if (q.x > 200 && q.x < 218 && Math.abs(q.vx) < 8) { mark("DOOR", f, q), phase = "SETTLE", jt = 0; return N; }
          if (jt > 300) { phase = "FAIL-DOORW"; return N; }
          return R; }
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
    if (trace && f % 10 === 0 && f > 400) console.log(`  f${f}: (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)}) ${phase}`);
    if (q.dead || q.dying) { done = `DEAD f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (String(phase).startsWith("FAIL")) { done = `FAIL@${phase} f${f} @(${px(q.x)},${px(q.y)})`; break; }
    if (phase === "DONE") break;
  }
  return { marks, done, phase, w };
}

const r = wgRun17({});
console.log(r.marks.map(m => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done || r.phase);

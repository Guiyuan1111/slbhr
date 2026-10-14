// r25c forest_25 内核探针 5：wg 全链反馈探针（出生台→全速入池→水下西行→阶梯→塔顶→西落横带→东顶l0关风→横带西行→西竖井→浮块→底层→wg门）
// 用法: node --import tsx TEMP/r25c/probe5.mjs (在 gyのFW 根)
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };

const w = makeWorld("forest_25");
const trace = [];
const marks = [];
let phase = "A-入池";
let windOffF = -1;

for (let f = 0; f < 1600; f++) {
  const wgInp = f < 90 ? N : (() => {
    const p = w.snapshotPlayer("watergirl");
    switch (phase) {
      case "A-入池": return L;                          // 全速走落西缘入池
      case "B-水下西行": if (p.x < 545) { phase = "C-登阶梯"; marks.push([f, "C", p.x, p.y]); } return L;
      case "C-登阶梯":                                   // 阶梯→塔顶，继续左
        if (p.y < 240 && p.x < 470) { phase = "D-塔顶西行"; marks.push([f, "D", p.x, p.y]); }
        return L;
      case "D-塔顶西行":                                 // 走落塔西缘
        if (p.y > 260) { phase = "E-落带"; marks.push([f, "E", p.x, p.y]); }
        return L;
      case "E-落带":                                     // 落横带 y448，等站稳
        if (p.y > 435 && Math.abs(p.vy) < 5) { phase = "F-东顶l0"; marks.push([f, "F", p.x, p.y]); }
        return N;
      case "F-东顶l0":                                   // 东行顶杆尖
        if (w.mechanisms.winds[0].state === 0) { windOffF = f; phase = "G-带西行"; marks.push([f, "G", p.x, p.y]); }
        return R;
      case "G-带西行":                                   // 折返西行至带西端
        if (p.y > 560) { phase = "H-西井下"; marks.push([f, "H", p.x, p.y]); }
        return L;
      case "H-西井下":                                   // 落层/浮块/底层
        if (p.y > 850) { phase = "I-门站位"; marks.push([f, "I", p.x, p.y]); }
        return L;
      case "I-门站位":
        if (p.x < 208 && Math.abs(p.vx) < 5) { phase = "DONE"; marks.push([f, "DONE", p.x, p.y]); }
        return L;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: N, watergirl: wgInp });
  const p = w.snapshotPlayer("watergirl");
  trace.push({ f, x: px(p.x), y: px(p.y), vx: px(p.vx), vy: px(p.vy), anim: p.anim, ph: w.phase });
  if (p.dead || p.dying || w.phase !== "playing") break;
}

const last = trace[trace.length - 1];
console.log(`== wg 全链 == frames=${trace.length} end=(${last.x},${last.y}) ph=${last.ph} windOffF=${windOffF}`);
console.log("相位切换:", marks.map((m) => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join("  "));
// 逐相位打印代表帧
let lastPhase = "";
for (let i = 0; i < trace.length; i += 10) {
  const t = trace[i];
  const ph = marks.find((m) => m[0] >= i);
  console.log(`  f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy}) ${t.anim}`);
}
const snap = w.mechSnapshot();
console.log("levers:", JSON.stringify(snap.levers), "winds:", JSON.stringify(snap.winds));
const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
console.log(`fb=(${px(fb.x)},${px(fb.y)}) wg=(${px(wg.x)},${px(wg.y)}) phase=${w.phase}`);

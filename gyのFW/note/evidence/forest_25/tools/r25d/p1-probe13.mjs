// r25c 探针 13：fb 全链 v4 —— 修正板段相位机（一次性跳板 + 全速跳池）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }

let phase = "A", sub = 0, jt = -1, mt = -1;
let marks = [];
const mark = (name, f, p) => { if (phase !== name) { marks.push(`f${f}->${name}(${px(p.x)},${px(p.y)})`); phase = name; sub = 0; } };

let ended = "";
for (let f = 0; f < 2600; f++) {
  const inp = f < 90 ? N : (() => {
    const p = w.snapshotPlayer("fireboy");
    switch (phase) {
      case "A": if (p.x < 860) mark("B", f, p); return L;
      case "B":
        if (Math.abs(p.vx) < 3 && p.x > 826 && p.x < 855) { sub++; return sub % 12 < 3 ? L : N; }
        if (p.y > 130) mark("C", f, p); return N;
      case "C": if (p.y > 205 && Math.abs(p.vy) < 5) mark("D", f, p); return N;
      case "D": if (p.x > 1000) mark("E", f, p); return R;
      case "E": sub++; if (p.y > 300) mark("F", f, p); return sub % 10 < 4 ? R : N;
      case "F": if (p.y > 335 && p.y < 365 && Math.abs(p.vy) < 5) mark("G", f, p); return N;
      case "G": if (p.y > 420) mark("G2", f, p); return R;
      case "G2": if (p.y > 715 && p.y < 755 && Math.abs(p.vy) < 5) mark("I", f, p); return N;
      case "I": if (p.x < 1022) mark("J", f, p); return L;
      case "J": // 站定→一次性跳板（UL 40f 后松）
        if (jt < 0) {
          if (Math.abs(p.vx) < 3) { sub++; if (sub > 8) { jt = 0; return UL; } return N; }
          sub = 0; return N;
        }
        jt++;
        if (jt === 1) marks.push(`f${f}:JUMP@(${px(p.x)},${px(p.y)})`);
        if (jt > 40 && p.y > 690 && p.y < 720 && Math.abs(p.vy) < 5 && p.x > 541 && p.x < 836) { mark("K", f, p); return N; }
        return jt <= 40 ? UL : N;
      case "K": // 上板检测：板顶站立 (中心≈704.6, 板 x541-835)
        if (p.y > 695 && p.y < 715 && Math.abs(p.vy) < 5 && p.x > 541 && p.x < 836) { mark("M", f, p); return N; }
        return N;
      case "M": // 板上全速西行，x<575 且全速 → 跳池
        if (mt < 0) {
          if (p.x < 575 && p.vx < -240) { mt = 0; marks.push(`f${f}:MJUMP@(${px(p.x)},${px(p.y)}) vx=${px(p.vx)}`); return UL; }
          return L;
        }
        mt++;
        return mt <= 80 ? UL : N;
      case "L": // 西地板 → 门
        if (p.y > 850 && Math.abs(p.vy) < 5 && p.x < 320) {
          if (p.x < 118) { if (!ended) ended = `f${f}:DOOR-REACHED(${px(p.x)},${px(p.y)})`; return N; }
          return L;
        }
        return N;
      default: return N;
    }
  })();
  const evs = w.step(1 / 60, { fireboy: inp, watergirl: N });
  const st = w.snapshotPlayer("fireboy");
  if (mt >= 0 && mt <= 170 && mt % 8 === 0) console.log(`  f${f}: (${px(st.x)},${px(st.y)}) v=(${px(st.vx)},${px(st.vy)}) ${st.anim} inp=${JSON.stringify(inp)}`);
  if (st.dead || st.dying) { ended = `f${f}:DEATH@(${px(st.x)},${px(st.y)})`; break; }
  if (w.phase === "won") { ended = `f${f}:WIN`; break; }
}
console.log("marks:", marks.join(" "));
console.log("ended:", ended, " phase=", phase);
const fin = w.snapshotPlayer("fireboy");
console.log(`final fb=(${px(fin.x)},${px(fin.y)}) v=(${px(fin.vx)},${px(fin.vy)}) ${fin.anim}`);
const sn = w.mechSnapshot();
console.log("hangings:", JSON.stringify(sn.hangings));
console.log("wind(l0):", JSON.stringify(w.mechanisms.levers[0].state), JSON.stringify(w.mechanisms.winds?.[0]?.state));

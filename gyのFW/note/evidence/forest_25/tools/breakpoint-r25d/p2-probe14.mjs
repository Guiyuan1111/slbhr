// r25c 探针 14：泵摆动力学 —— 上板后 R 60f 再 L，观察板摆与人的位置耦合
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }

// 快进到板上：与 probe13 相同的 A..K 链
let phase = "A", sub = 0, jt = -1;
function input(f) {
  const p = w.snapshotPlayer("fireboy");
  switch (phase) {
    case "A": if (p.x < 860) phase = "B"; return L;
    case "B":
      if (Math.abs(p.vx) < 3 && p.x > 826 && p.x < 855) { sub++; return sub % 12 < 3 ? L : N; }
      if (p.y > 130) phase = "C"; return N;
    case "C": if (p.y > 205 && Math.abs(p.vy) < 5) phase = "D"; return N;
    case "D": if (p.x > 1000) phase = "E"; return R;
    case "E": sub++; if (p.y > 300) phase = "F"; return sub % 10 < 4 ? R : N;
    case "F": if (p.y > 335 && p.y < 365 && Math.abs(p.vy) < 5) phase = "G"; return N;
    case "G": if (p.y > 420) phase = "G2"; return R;
    case "G2": if (p.y > 715 && p.y < 755 && Math.abs(p.vy) < 5) phase = "I"; return N;
    case "I": if (p.x < 1022) phase = "J"; return L;
    case "J":
      if (jt < 0) {
        if (Math.abs(p.vx) < 3) { sub++; if (sub > 8) { jt = 0; return UL; } return N; }
        sub = 0; return N;
      }
      jt++;
      if (jt > 40 && p.y > 690 && p.y < 720 && Math.abs(p.vy) < 5 && p.x > 541 && p.x < 836) phase = "P";
      return jt <= 40 ? UL : N;
    case "P": return N; // 占位，主循环接管
    default: return N;
  }
}
let f = 0;
for (; f < 2000; f++) { w.step(1 / 60, { fireboy: input(f), watergirl: N }); if (phase === "P") break; }
console.log(`board reached at f${f}`);
const p0 = w.snapshotPlayer("fireboy");
const h0a = w.mechSnapshot().hangings[0];
console.log(`her=(${px(p0.x)},${px(p0.y)}) board x=${px(h0a.x)} ang=${h0a.angle.toFixed(4)}`);

// 泵摆测试：R 60f → L 保持，观察 400f
for (let k = 0; k < 460; k++) {
  const inp = k < 60 ? R : L;
  w.step(1 / 60, { fireboy: inp, watergirl: N });
  const p = w.snapshotPlayer("fireboy");
  const h = w.mechSnapshot().hangings[0];
  if (k % 10 === 0) console.log(`k${k}: her=(${px(p.x)},${px(p.y)}) vx=${px(p.vx)} board x=${px(h.x)} ang=${h.angle.toFixed(4)} ${p.anim}`);
}

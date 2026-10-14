// r25c 探针 8：复现 fb 链 f1000-1300 段，转储全部机关/刚体位置
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
// 与 probe6 相同的相位机（简化：只跑到板跳段）
let phase = "A", sub = 0;
for (let f = 0; f < 1400; f++) {
  const inp = f < 90 ? N : (() => {
    const p = w.snapshotPlayer("fireboy");
    const mark = (name) => { if (phase !== name) { phase = name; sub = 0; } };
    switch (phase) {
      case "A": if (p.x < 860) mark("B"); return L;
      case "B":
        if (Math.abs(p.vx) < 3 && p.x > 826 && p.x < 855) { sub++; return sub % 12 < 3 ? L : N; }
        if (p.y > 130) mark("C"); return N;
      case "C": if (p.y > 205 && Math.abs(p.vy) < 5) mark("D"); return N;
      case "D": if (p.x > 1000) mark("E"); return R;
      case "E": sub++; if (p.y > 300) mark("F"); return sub % 10 < 4 ? R : N;
      case "F": if (p.y > 335 && p.y < 365 && Math.abs(p.vy) < 5) mark("G"); return N;
      case "G": if (p.y > 420) mark("G2"); return R;
      case "G2": if (p.y > 715 && p.y < 755 && Math.abs(p.vy) < 5) mark("I"); return N;
      case "I": if (p.x < 1022) mark("J"); return L;
      case "J":
        if (Math.abs(p.vx) < 3) { sub++; if (sub > 8 && sub < 48) return UL; return N; }
        return N;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: inp, watergirl: N });
  if (f >= 1020 && f <= 1300 && f % 20 === 0) {
    const p = w.snapshotPlayer("fireboy");
    const sn = w.mechSnapshot();
    console.log(`f${f}: fb=(${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim}`);
    if (f === 1120) {
      console.log("  platforms:", JSON.stringify(sn.platforms));
      console.log("  hangings:", JSON.stringify(sn.hangings));
      console.log("  props:", JSON.stringify(sn.props));
      console.log("  pushers:", JSON.stringify(sn.pushers));
    }
  }
}

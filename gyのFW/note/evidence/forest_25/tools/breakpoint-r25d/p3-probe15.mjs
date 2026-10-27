// r25c 探针 15：板跳落点暴力扫描 —— 从板上 x_jump（相对板状态）起跳，报告结局
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

// 快进到板上（K 态）一次，记录板与人的状态；然后用世界重放做扫描太贵——
// 改为：每次扫描新建世界，快进到 K 后施加定制跳。
// 为提速：K 快进段共享（内核无法克隆世界，只能重跑，~1s/次可接受）
async function runCase(xJumpTarget, holdLframes, label) {
  const w = makeWorld("forest_25");
  for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
  let phase = "A", sub = 0, jt = -1, boardF = -1, jumped = -1;
  for (let f = 0; f < 2400; f++) {
    const p = w.snapshotPlayer("fireboy");
    let inp = N;
    switch (phase) {
      case "A": if (p.x < 860) phase = "B"; inp = L; break;
      case "B":
        if (Math.abs(p.vx) < 3 && p.x > 826 && p.x < 855) { sub++; inp = sub % 12 < 3 ? L : N; }
        else { if (p.y > 130) phase = "C"; inp = N; }
        break;
      case "C": if (p.y > 205 && Math.abs(p.vy) < 5) phase = "D"; break;
      case "D": if (p.x > 1000) phase = "E"; inp = R; break;
      case "E": sub++; if (p.y > 300) phase = "F"; inp = sub % 10 < 4 ? R : N; break;
      case "F": if (p.y > 335 && p.y < 365 && Math.abs(p.vy) < 5) phase = "G"; break;
      case "G": if (p.y > 420) phase = "G2"; inp = R; break;
      case "G2": if (p.y > 715 && p.y < 755 && Math.abs(p.vy) < 5) phase = "I"; break;
      case "I": if (p.x < 1022) phase = "J"; inp = L; break;
      case "J":
        if (jt < 0) {
          if (Math.abs(p.vx) < 3) { sub++; if (sub > 8) { jt = 0; inp = UL; } }
          else sub = 0;
        } else {
          jt++;
          inp = jt <= 40 ? UL : N;
          if (jt > 40 && p.y > 690 && p.y < 720 && Math.abs(p.vy) < 5 && p.x > 541 && p.x < 836) { phase = "K"; boardF = f; }
        }
        break;
      case "K": { // 板上：向西跑（uphill），到达 xJumpTarget 全速起跳
        if (p.x <= xJumpTarget && p.vx < -240) { inp = UL; jumped = f; phase = "M"; }
        else inp = L;
        break;
      }
      case "M": inp = holdLframes > 0 ? L : N; break;
    }
    w.step(1 / 60, { fireboy: inp, watergirl: N });
    const st = w.snapshotPlayer("fireboy");
    if (st.dead || st.dying) {
      return `${label} xj=${xJumpTarget}: DEATH f${f} @(${px(st.x)},${px(st.y)})`;
    }
    if (w.phase === "won") return `${label} xj=${xJumpTarget}: WIN?! f${f}`;
    if (phase === "M" && st.y > 850 && Math.abs(st.vy) < 5) {
      return `${label} xj=${xJumpTarget}: LANDED f${f} @(${px(st.x)},${px(st.y)}) alive`;
    }
    if (phase === "M" && f - jumped > 300) return `${label} xj=${xJumpTarget}: STUCK f${f} @(${px(st.x)},${px(st.y)}) ${st.anim}`;
  }
  return `${label} xj=${xJumpTarget}: TIMEOUT`;
}

// 扫描：跳点 495..545 步长 5；落地后 hold L（向西走）或 N
const cases = [];
for (let xj = 495; xj <= 545; xj += 5) cases.push(runCase(xj, 1, "holdL"));
// 串行执行
(async () => {
  for (const c of cases) console.log(await c);
})();

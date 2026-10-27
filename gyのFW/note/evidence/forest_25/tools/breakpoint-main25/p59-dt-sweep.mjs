// p59 (主会话核验): dt 敏感性扫描——r25d 判定"mesa 东极限 977.2 < 缺口 1056"基于固定 dt=1/60；
// oracle 实跑为可变 dt（档 30 §0.13 P1-D2）。混沌弹跳链+风对 dt 敏感，若某 dt 下东极限≥1056
// 则结论翻转为"固定 dt 差异"而非"原版数据缺陷"。输入脚本与 p56 一致（跳周期 40 帧随 dt 等比换算）。
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };

function run(dt, jumpPeriod) {
  const R = { up: false, left: false, right: true };
  const UR = { up: true, left: false, right: true };
  const w = makeWorld("forest_25");
  let maxX = 0, maxXf = 0, landed = false;
  for (let f = 0; f < 1500; f++) {
    const q = w.snapshotPlayer("watergirl");
    let inp;
    if (f < 90) inp = N;
    else if (q.y < 130) inp = { up: false, left: true, right: false };
    else if (q.y < 205) inp = { up: false, left: true, right: false };
    else inp = f % jumpPeriod < 1 ? UR : R;
    // 东极限只统计离开出生高台（x<1000 说明已在 mesa/西侧段）之后的东进
    if (!landed && q.x < 1000 && q.y > 200) landed = true;
    if (landed && q.x > maxX) { maxX = q.x; maxXf = f; }
    w.step(dt, { fireboy: N, watergirl: inp });
    if (q.dead) break;
  }
  return { maxX, maxXf, landed };
}

const GAP = 1056;
console.log("dt      跳周期  东极限x   帧号   缺口1056  余量");
for (const dt of [1 / 45, 1 / 50, 1 / 55, 1 / 60, 1 / 65, 1 / 70, 1 / 80]) {
  for (const jp of [40, 34, 46]) {
    const { maxX, maxXf } = run(dt, jp);
    const ok = maxX >= GAP ? "✓ 达" : "✗";
    console.log(
      `1/${Math.round(1 / dt)}`.padEnd(8),
      String(jp).padEnd(6),
      maxX.toFixed(1).padEnd(8),
      String(maxXf).padEnd(6),
      ok,
      (maxX - GAP).toFixed(1),
    );
  }
}

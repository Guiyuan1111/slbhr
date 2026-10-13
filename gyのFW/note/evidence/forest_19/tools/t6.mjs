// r19c t6：跳跃高度-按键时长关系（variable jump?）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const test = (HOLD) => {
  const w = makeWorld("forest_19");
  let curF = 0;
  const st = (n, i = {}) => { for (let k = 0; k < n; k++) { w.step(1 / 60, { fireboy: {}, watergirl: i }); curF++; } };
  st(30);
  const y0 = w.snapshotPlayer("watergirl").y;
  st(1, { up: true });
  for (let k = 1; k < HOLD; k++) st(1, { up: true });
  let apex = y0, apexF = curF;
  for (let k = 0; k < 120; k++) {
    st(1);
    const y = w.snapshotPlayer("watergirl").y;
    if (y < apex) { apex = y; apexF = curF; }
  }
  console.log(`HOLD=${HOLD}f 中心净升=${(y0 - apex).toFixed(1)}px @f+${apexF - 30} apex中心y=${apex.toFixed(1)}`);
};
for (const h of [1, 2, 5, 10, 20, 30, 45]) test(h);

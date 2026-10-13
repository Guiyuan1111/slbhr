// forest_17 机构探针（flashbp17）：逐组"按住拉杆"300f，测平台真实行程与 group 耦合。
// 用法: node --import tsx TEMP/flashbp17/probe-f17.mjs
import { makeWorld } from "../../../../scripts/e2e/routetool/kernel.mjs";

const platRect = (p) => {
  const pos = p.body.GetPosition();
  return { x: +(pos.x * -32).toFixed(1), y: +(pos.y * -32).toFixed(1) };
};
const noInput = () => ({ fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });

for (const levIdx of [0, 1, 2, 3, 4]) {
  const w = makeWorld("forest_17");
  const lev = w.mechanisms.levers[levIdx];
  const f0 = w.mechanisms.platforms.map(platRect);
  // 钉住杆角过零（等效角色压杆保持）：gid25(onis=-1,startPos=1) 杆角取 -0.3rad；gid24(onis=1,startPos=-1) 取 +0.3
  const holdAngle = lev.angleDeg() > 0 ? -0.3 : 0.3;
  let flipF = -1;
  for (let f = 0; f < 300; f++) {
    lev.body.SetAngle(holdAngle);
    lev.body.SetAngularVelocity(0);
    w.step(1 / 60, noInput());
    if (flipF < 0 && lev.state === 1) flipF = f;
  }
  const f300 = w.mechanisms.platforms.map(platRect);
  const moved = w.mechanisms.platforms
    .map((p, i) => {
      const dx = +(f300[i].x - f0[i].x).toFixed(1);
      const dy = +(f300[i].y - f0[i].y).toFixed(1);
      return `p${i}(g${p.group}) disp=(${dx},${dy})`;
    })
    .join(" ");
  console.log(`lever l${levIdx}(g${lev.group}) state=${lev.state} flip@f=${flipF} | ${moved}`);
}

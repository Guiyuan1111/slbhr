// probe3: H1 终态全快照（dying/dead/inLiquid/vx/vy/anim）+ wind ON 时 fb 直落进风道带再验证
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
{
  const w = makeWorld("forest_25");
  for (let i = 0; i < 60; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
  let stopped = false;
  for (let f = 0; f <= 700; f++) {
    const p = w.snapshotPlayer("fireboy");
    if (!stopped && p.x < 840) stopped = true;
    w.step(1 / 60, { fireboy: stopped ? {} : { left: true }, watergirl: {} });
    if (f === 150 || f === 200 || f === 240 || f === 300 || f === 500 || f === 700) {
      const q = w.snapshotPlayer("fireboy");
      console.log(`f${f}:`, JSON.stringify(q));
    }
  }
}

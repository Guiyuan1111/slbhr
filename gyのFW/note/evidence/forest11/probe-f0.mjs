// r28 探针：f0-f5 初始态（lever 自动翻转 / wind 状态 / 平台位置 / 事件）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const N = Number(process.argv[3] ?? 6);
for (const level of [process.argv[2]]) {
  console.log(`\n===== ${level} f0..f${N - 1} no-input =====`);
  const w = makeWorld(level);
  for (let f = 0; f < N; f++) {
    const evs = w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
    const snap = w.mechSnapshot();
    const lv = snap.levers.map((l) => `l${l.id}(g${l.group},st${l.state},${(l.angle * 180 / Math.PI).toFixed(1)}deg)`).join(" ");
    const wd = snap.winds.map((x) => `f${x.id}(g${x.group},st${x.state})`).join(" ");
    const pf = snap.platforms.map((p) => `p${p.id}(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(" ");
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    console.log(`f${f}: ev=${JSON.stringify(evs.filter(e => e.type !== "win"))}`);
    console.log(`    levers[${lv}] winds[${wd}] plat[${pf}]`);
    console.log(`    fb=(${fb.x.toFixed(1)},${fb.y.toFixed(1)}) wg=(${wg.x.toFixed(1)},${wg.y.toFixed(1)}) phase=${w.phase}`);
  }
}

// 冲刺末段逐帧 trace + stepEvents 碰撞事件
import { wgRun } from "./p14-wg-v11.mjs";
let on = false;
wgRun({ dbg: (f, w, ph) => {
  if (ph === "SPRINT") on = true;
  if (!on) return;
  const q = w.snapshotPlayer("watergirl");
  if (f > 3255) {
    const ev = (w.stepEvents ?? []).slice(-3);
    console.log(`f${f}: (${q.x.toFixed(1)},${q.y.toFixed(1)}) v=(${q.vx.toFixed(1)},${q.vy.toFixed(1)}) ${q.anim} ${q.grounded ? "G" : "air"} ev=${JSON.stringify(ev).slice(0, 200)}`);
  }
}, });

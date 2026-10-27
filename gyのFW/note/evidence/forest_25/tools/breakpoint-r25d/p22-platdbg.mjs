import { wgRun } from "./p21-wg-v12.mjs";
let on = false, n = 0;
wgRun({ dbg: (f, w, ph) => {
  if (ph === "PLAT") { on = true; n++; if (n < 40 || n % 60 === 0) {
    const q = w.snapshotPlayer("watergirl");
    console.log(`PLAT#${n} f${f}: (${q.x.toFixed(1)},${q.y.toFixed(1)}) v=(${q.vx.toFixed(1)},${q.vy.toFixed(1)}) anim=${q.anim}`);
  } }
  else on = false;
}});

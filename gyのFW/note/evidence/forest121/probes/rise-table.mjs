// 站平跳升 vs 持握时长（forest_12_1, 832 台地, 实测 rise=107.8 与持握无关）
import { runSeg, ev } from "./harness.mjs";
for (const H of [5, 12, 18, 24, 30]) {
  const fb = [ ev(10,"right","down"), ev(180,"right","up"), ev(182,"left","down"), ev(292,"left","up"), ev(345,"up","down"), ev(344+H,"up","up") ];
  const { trace } = runSeg("forest_12_1", fb, [], 400);
  let min = 9999;
  for (let f = 345; f < 395; f++) min = Math.min(min, trace[f].fb[1] + 35.2);
  console.log(`hold=${H}f minFeet=${min.toFixed(1)} rise=${(831.7 - min).toFixed(1)}`);
}

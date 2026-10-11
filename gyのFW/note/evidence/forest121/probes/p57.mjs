import { runSeg, ev, dump } from "./harness.mjs";
const fb = [
  ev(10,"right","down"),
  ev(180,"right","up"), ev(182,"left","down"),
  ev(292,"left","up"),
  ev(400,"left","down"),
  ev(472,"left","up"), ev(476,"right","down"), ev(477,"up","down"), ev(489,"up","up"),
  ev(510,"right","up"),
  ev(515,"left","down"), ev(568,"left","up"),   // walk west, stop ~x142 on hyp
  ev(571,"left","down"), ev(572,"left","up"),   // thread tap
  ev(595,"left","down"), ev(623,"left","up"),   // shaft stairs west-up
  ev(628,"right","down"), ev(629,"up","down"), ev(641,"up","up"),  // jump-east from (32,544)
  ev(680,"right","up"),
];
const { trace } = runSeg("forest_12_1", fb, [], 740);
for (let f=555; f<740; f+=5){ const t=trace[f]; if(t) console.log(f, t.fb[0].toFixed(1), (t.fb[1]+35.2).toFixed(1)); }
console.log("doors:", JSON.stringify(trace[739].doors));

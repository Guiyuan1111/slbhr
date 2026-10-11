import { runSeg, ev, dump } from "./harness.mjs";
const wg = [
  ev(10,"left","down"), ev(130,"left","up"), ev(210,"left","down"), ev(236,"left","up"),
  ev(256,"left","down"),
  ev(292,"left","up"), ev(292,"right","down"),
  ev(298,"right","up"),
  ev(302,"right","down"), ev(308,"right","up"),
  ev(311,"right","down"), ev(312,"up","down"), ev(324,"up","up"),
  ev(478,"right","up"),
];
const { trace } = runSeg("forest_12_1", [], wg, 560);
for (let f=310; f<560; f+=10){ const t=trace[f]; if(t) console.log(f, t.wg[0].toFixed(1), (t.wg[1]+35.2).toFixed(1), "d:"+t.doors.wg); }
console.log("final:", JSON.stringify(trace[559].doors));

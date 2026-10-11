import { runSeg, ev, dump } from "./harness.mjs";
const wg = [
  ev(10,"left","down"), ev(130,"left","up"), ev(210,"left","down"), ev(236,"left","up"),
  ev(256,"left","down"),
  ev(292,"left","up"), ev(292,"right","down"),
  ev(298,"right","up"),
  ev(302,"right","down"), ev(303,"up","down"), ev(304,"up","up"),
  ev(465,"up","down"), ev(477,"up","up"),      // pin-jump retimed to pin arrival ~f460
  ev(560,"right","up"), ev(562,"right","down"),// keep rolling east into basin
];
const fb = [];
const { trace } = runSeg("forest_12_1", fb, wg, 700);
for (let f=440; f<700; f+=10){ const t=trace[f]; if(t) console.log(f, t.wg[0].toFixed(1), (t.wg[1]+35.2).toFixed(1)); }
console.log("doors:", JSON.stringify(trace[699].doors));

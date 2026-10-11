import { runSeg, ev, dump } from "./harness.mjs";
const wg = [ ev(10,"left","down"), ev(200,"left","up") ];  // plain walk west, brake at 200
const { trace } = runSeg("forest_12_1", [], wg, 300);
for (let f=20; f<300; f+=10){ const t=trace[f]; if(t) console.log(f, t.wg[0].toFixed(1), (t.wg[1]+35.2).toFixed(1)); }
console.log("doors:", JSON.stringify(trace[299].doors));

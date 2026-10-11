import { runSeg, ev, dump } from "./harness.mjs";
const fb = [ ev(10,"right","down") ];  // pure walk east
const r = runSeg("forest_12_1", fb, [ ev(10,"left","down") ], 240);
console.log(dump(r.trace, "fb", 4, 40, 200));

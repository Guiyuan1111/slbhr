import { runSeg, ev, dump } from "./harness.mjs";
const fb = [
  ev(10,"right","down"), ev(205,"right","up"), ev(205,"left","down"),
  ev(221,"up","down"), ev(226,"up","up"),
  ev(320,"left","up")
];
const r = runSeg("forest_12_1", fb, [ ev(10,"left","down") ], 320);
console.log(dump(r.trace, "fb", 2, 218, 300));
console.log("collected:", r.collected.join(" "));

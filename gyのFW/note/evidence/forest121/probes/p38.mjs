import { runSeg, ev, dump } from "./harness.mjs";
// FB: descent -> W pin (543.9,415.8) -> pin-jump WEST (full hold, left held) -> slope/shelf -> 512 floor -> acid dip -> 480 tier -> step up platform -> park door (216-280, park ~248)
const fb = [
  ev(10,"right","down"), ev(205,"right","up"), ev(207,"left","down"),
  ev(221,"up","down"), ev(226,"up","up"),
  ev(262,"left","down"), ev(262,"up","down"), ev(274,"up","up"),   // pin-jump west, full hold, left held
  ev(560,"left","up")
];
// WG: descent -> seesaw -> walk-off west tip (left held) -> "\" slope (582,451) -> jump-east (full hold) -> "/" climb -> E pin (704.4) -> pin-jump EAST -> "\" descent -> 480 -> basin -> rim -> platform -> park door (~1000)
const wg = [
  ev(10,"left","down"), ev(130,"left","up"), ev(210,"left","down"), ev(236,"left","up"),
  ev(256,"left","down"),
  ev(292,"left","up"), ev(292,"right","down"),
  ev(302,"right","up"),                                            // brief pause before jump (p35 jumped at 303 from standstill-ish)
  ev(303,"right","down"), ev(303,"up","down"), ev(304,"up","up"),  // jump-east from (582,451)
  ev(410,"up","down"), ev(422,"up","up"),                          // E pin-jump east, full hold
  ev(600,"right","up")
];
const r = runSeg("forest_12_1", fb, wg, 700);
console.log("events:", JSON.stringify(r.evs));
console.log("collected:", r.collected.join(" "));
const t = r.trace, n = t.length;
console.log("traceLen:", n, "doors@end:", JSON.stringify(t[n-1].doors), "won:", !!r.world.won);
console.log("== FB 252-560 ==");
console.log(dump(t, "fb", 10, 252, 560));
console.log("== WG 290-620 ==");
console.log(dump(t, "wg", 10, 290, 620));

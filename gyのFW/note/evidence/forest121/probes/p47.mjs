import { runSeg, ev, dump } from "./harness.mjs";
const fb = [
  ev(10,"right","down"),
  ev(82,"right","up"),
  ev(84,"left","down"),
  ev(140,"left","up"),          // release AT the slab west edge -> straight-ish drop
  ev(154,"right","down"),       // walk east into door zone after landing
  ev(172,"right","up")
];
const wg = [
  ev(10,"left","down"), ev(130,"left","up"), ev(210,"left","down"), ev(236,"left","up"),
  ev(256,"left","down"),
  ev(292,"left","up"), ev(292,"right","down"),
  ev(298,"right","up"),
  ev(302,"right","down"), ev(303,"up","down"), ev(304,"up","up"),
  ev(410,"up","down"), ev(422,"up","up"),
  ev(600,"right","up")
];
const r = runSeg("forest_12_1", fb, wg, 700);
console.log("events:", JSON.stringify(r.evs));
console.log("collected:", r.collected.join(" "));
const t = r.trace, n = t.length;
console.log("traceLen:", n, "doors@end:", JSON.stringify(t[n-1].doors), "won:", !!r.world.won);
console.log("== FB 110-180 ==");
console.log(dump(t, "fb", 3, 110, 180));
console.log("== WG 290-620 ==");
console.log(dump(t, "wg", 10, 290, 620));

import { runSeg, ev, dump } from "./harness.mjs";
const fb = [
  ev(10,"right","down"),
  ev(180,"right","up"), ev(182,"left","down"),
  ev(292,"left","up"),
  ev(400,"left","down"),                 // floor: walk west
  ev(472,"left","up"), ev(476,"right","down"), ev(477,"up","down"), ev(489,"up","up"),  // jump onto (128,800) hyp
  ev(510,"right","up"),                  // settle on 768 plateau
  ev(515,"left","down"), ev(529,"left","up"),   // west to (128,800) tip
  ev(532,"left","down"), ev(533,"left","up"),   // thread tap
  ev(555,"left","down"), ev(583,"left","up"),   // shaft stairs west-up to (32,544)
  ev(588,"right","down"), ev(589,"up","down"), ev(601,"up","up"),  // jump-east
  ev(645,"right","up"),                  // stop inside door zone
];
const { trace } = runSeg("forest_12_1", fb, [], 700);
for (let f=470; f<700; f+=5){ const t=trace[f]; if(t) console.log(f, t.fb[0].toFixed(1), (t.fb[1]+35.2).toFixed(1)); }
console.log("doors:", JSON.stringify(trace[699].doors), "won:", JSON.stringify(trace[699]));

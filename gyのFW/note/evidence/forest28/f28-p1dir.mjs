import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_28");
const DT = 1/60;
const scr = (b) => ({ x: -32*b.GetPosition().x, y: -32*b.GetPosition().y });
const near = (arr, x, y) => arr.find(m => { const s = scr(m.body); return Math.abs(s.x-x)<2 && Math.abs(s.y-y)<2; });
const p1 = near(w.mechs.platforms, 1072, 848);
const l3 = near(w.mechs.levers, 112, 512);
if (!p1 || !l3) { console.log("lookup failed", !!p1, !!l3); process.exit(1); }
const pc = () => scr(p1.body);
console.log("home p1 center:", JSON.stringify(pc()), "l3 state:", l3.state);
for (let f = 0; f < 30; f++) w.step(DT, { fireboy: { cursors: {} }, watergirl: { cursors: {} } });
console.log("after 30f idle:", JSON.stringify(pc()), "l3 state:", l3.state);
// force g0 on
l3.state = 1; p1.state = 1; p1.signalApply();
let last = pc();
for (let f = 0; f < 400; f++) {
  w.step(DT, { fireboy: { cursors: {} }, watergirl: { cursors: {} } });
  const c = pc();
  if (Math.abs(c.y - last.y) > 0.05 || f === 399) { console.log(`f${f} p1 (${c.x.toFixed(1)},${c.y.toFixed(1)})`); last = c; }
}
console.log("g0=1 end:", JSON.stringify(pc()));
// g0 off
p1.state = 0; p1.signalApply();
for (let f = 0; f < 400; f++) w.step(DT, { fireboy: { cursors: {} }, watergirl: { cursors: {} } });
console.log("g0=0 end:", JSON.stringify(pc()));

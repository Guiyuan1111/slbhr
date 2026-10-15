// r25d p8b：调试异常上升力——逐帧 vy/接触/风态
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const vec = (x, y) => new (globalThis.box2d).b2Vec2(x, y);

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) { w.mechanisms.levers[0].body.ApplyTorque(30); w.step(1 / 60, { fireboy: N, watergirl: N }); }
console.log("wind:", w.mechanisms.winds?.[0]?.state, "l0:", w.mechanisms.levers[0].state);
const fb = w.players.fireboy;
fb.body.SetTransformVecRadians(vec(-890 / 32, -832 / 32), 0);
fb.body.SetLinearVelocity(vec(0, 0));
let jumped = -1;
for (let f = 0; f < 160; f++) {
  const p0 = w.snapshotPlayer("fireboy");
  let inp = N;
  if (jumped < 0) { inp = { up: true, left: false, right: false }; jumped = f; }
  else inp = L;
  const evs = w.step(1 / 60, { fireboy: inp, watergirl: N });
  if (f % 10 === 0 || (f > 50 && f < 130 && f % 5 === 0)) {
    const p = w.snapshotPlayer("fireboy");
    const h = w.mechSnapshot().hangings[0];
    const feetN = fb.feetContacts?.length ?? "?";
    console.log(`f${f}: (${px(p.x)},${px(p.y)}) vy=${px(p.vy)} anim=${p.anim} feet=${feetN} 板心x=${px(h.x)} 板ang=${h.angle.toFixed(3)} inLiquid=${p.inLiquid} ev=${JSON.stringify(evs)}`);
  }
  if (w.snapshotPlayer("fireboy").dead) break;
}

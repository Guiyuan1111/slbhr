// (a) box push east on deck -> portal pair-0 -> row-19?  (b) push west to pusher button -> latch
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const I = { fireboy: { ...NONE }, watergirl: { ...NONE } };
const F = w.players.fireboy.body;
const log = (tag) => {
  const f = w.snapshotPlayer('fireboy');
  const b = w.snapshotPlayer('watergirl');
  console.log(`${tag} fb[${f.x.toFixed(1)},${f.y.toFixed(1)}] wg[${b.x.toFixed(1)},${b.y.toFixed(1)}]`);
};
// teleport fb next to box west side, box at ~960; push box east by walking against it
F.SetPosition({ x: -900 / 32, y: -288 / 32 });
F.SetLinearVelocity({ x: 0, y: 0 });
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
let boxX = 0, lastBox = 0, stuck = 0;
for (let f = 0; f < 1400; f++) {
  w.step(1 / 60, I);
  const b = w.snapshotPlayer('watergirl');
  if (f % 100 === 0) console.log(`push f${f} box=${b.x.toFixed(1)},${b.y.toFixed(1)} fb=${w.snapshotPlayer('fireboy').x.toFixed(1)}`);
  if (Math.abs(b.x - lastBox) < 0.01 && b.x > 900) stuck++; else stuck = 0;
  lastBox = b.x;
  if (stuck > 300) { console.log(`box stuck at ${b.x.toFixed(1)} f${f}`); break; }
  if (b.x > 1100 && b.y > 500) { console.log(`BOX ON ROW-19 f${f} box=${b.x.toFixed(1)},${b.y.toFixed(1)}`); break; }
}
log('after push east');
// push west toward button 1056
I.fireboy = { ...NONE, left: true };
for (let f = 0; f < 1200; f++) {
  w.step(1 / 60, I);
  const b = w.snapshotPlayer('watergirl');
  if (f % 100 === 0) console.log(`pushW f${f} box=${b.x.toFixed(1)},${b.y.toFixed(1)} fb=${w.snapshotPlayer('fireboy').x.toFixed(1)}`);
  if (b.x >= 1040 && b.x <= 1075 && b.y > 500) { console.log(`BOX ON BUTTON f${f} box=${b.x.toFixed(1)},${b.y.toFixed(1)}`); break; }
}
I.fireboy = { ...NONE };
for (let f = 0; f < 80; f++) w.step(1 / 60, I);
// read pusher state
const mechs = w.mechs || w.world?.mechs || w.built?.mechs;
try {
  const pushers = mechs.pushers;
  const plats = mechs.platforms;
  console.log('pusher state:', pushers.map(p => p.state), 'platform y/state:', plats.map(p => `${(-p.body.GetPosition().y*32).toFixed(0)},${p.state}`));
} catch (e) { console.log('mech read err', e.message); }
log('end');

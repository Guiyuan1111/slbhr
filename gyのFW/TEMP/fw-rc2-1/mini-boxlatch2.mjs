// box = mechs.props. push east on deck -> portal -> row-19 -> push west -> button latch
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const I = { fireboy: { ...NONE }, watergirl: { ...NONE } };
const F = w.players.fireboy.body;
const props = w.mechs.props;
const box = props[0].body;
const bx = () => { const p = box.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; };
console.log('props:', props.length, 'box at', JSON.stringify(bx()));
F.SetPosition({ x: -900 / 32, y: -288 / 32 });
F.SetLinearVelocity({ x: 0, y: 0 });
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
let last = 0, stuck = 0, done = false;
for (let f = 0; f < 1500 && !done; f++) {
  w.step(1 / 60, I);
  const b = bx();
  if (f % 100 === 0) console.log(`pushE f${f} box=${b.x.toFixed(1)},${b.y.toFixed(1)} fb=${w.snapshotPlayer('fireboy').x.toFixed(1)}`);
  if (Math.abs(b.x - last) < 0.01) stuck++; else stuck = 0;
  last = b.x;
  if (stuck > 240) { console.log(`box stuck at ${b.x.toFixed(1)} f${f}`); done = true; }
}
I.fireboy = { ...NONE };
for (let f = 0; f < 60; f++) w.step(1 / 60, I);
console.log('box now', JSON.stringify(bx()));
// if on row-19 east, push west
const b0 = bx();
if (b0.y > 500) {
  console.log('BOX ON ROW-19 -> push west');
  // fb must get to row-19 east side of box: teleport fb east of box
  F.SetPosition({ x: -(b0.x + 60) / 32, y: -560 / 32 });
  F.SetLinearVelocity({ x: 0, y: 0 });
  for (let f = 0; f < 40; f++) w.step(1 / 60, I);
  I.fireboy = { ...NONE, left: true };
  last = 0; stuck = 0; done = false;
  for (let f = 0; f < 1500 && !done; f++) {
    w.step(1 / 60, I);
    const b = bx();
    if (f % 100 === 0) console.log(`pushW f${f} box=${b.x.toFixed(1)},${b.y.toFixed(1)}`);
    if (Math.abs(b.x - last) < 0.01) stuck++; else stuck = 0;
    last = b.x;
    if (stuck > 240) { console.log(`box stuck at ${b.x.toFixed(1)} f${f}`); done = true; }
  }
  I.fireboy = { ...NONE };
  for (let f = 0; f < 120; f++) w.step(1 / 60, I);
}
try {
  console.log('pusher state:', w.mechs.pushers.map(p => p.state), 'platform:', w.mechs.platforms.map(p => `${(-p.body.GetPosition().y * 32).toFixed(0)},st${p.state}`));
} catch (e) { console.log('mech err', e.message); }

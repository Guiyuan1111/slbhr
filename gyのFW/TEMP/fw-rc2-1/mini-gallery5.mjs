// cage escape: vertical jump + east drift over slab top (352), then run-jump west through plane
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const I = { fireboy: { ...NONE }, watergirl: { ...NONE } };
const F = w.players.fireboy.body;
F.SetPosition({ x: -112 / 32, y: -476.8 / 32 });
F.SetLinearVelocity({ x: 0, y: 0 });
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
I.fireboy = { up: true, left: false, right: true };
w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
for (let f = 0; f < 45; f++) w.step(1 / 60, I);
let a = w.snapshotPlayer('fireboy');
console.log(`on block x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`);
// settle, then vertical jump holding east (cage escape)
I.fireboy = { ...NONE };
for (let f = 0; f < 30; f++) w.step(1 / 60, I);
I.fireboy = { up: true, left: false, right: true };
w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
for (let f = 0; f < 60; f++) {
  w.step(1 / 60, I);
  const b = w.snapshotPlayer('fireboy');
  if (f % 5 === 0) console.log(`  cageJ f+${f} x=${b.x.toFixed(1)} y=${b.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);
}
a = w.snapshotPlayer('fireboy');
console.log(`cage result x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} feet=${(a.y + 35.2).toFixed(1)}`);

// walk EAST into soft cap (face east), then jump holding east -> trigger portal
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const I = { fireboy: { ...NONE }, watergirl: { ...NONE } };
const F = w.players.fireboy.body;
F.SetPosition({ x: -112 / 32, y: -476.8 / 32 });
F.SetLinearVelocity({ x: 0, y: 0 });
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
I.fireboy = { up: true, left: false, right: true };  // step jump
w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
for (let f = 0; f < 45; f++) w.step(1 / 60, I);
let a = w.snapshotPlayer('fireboy');
console.log(`on block x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`);
// walk EAST to ~340
I.fireboy = { ...NONE, right: true };
for (let f = 0; f < 75; f++) w.step(1 / 60, I);
a = w.snapshotPlayer('fireboy');
console.log(`walked east x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`);
// jump holding LEFT (west drift through plane mid-air)
I.fireboy = { up: true, left: true, right: false };
w.step(1 / 60, I);
I.fireboy = { ...NONE, left: true };
let tp = false;
for (let f = 0; f < 160; f++) {
  w.step(1 / 60, I);
  const b = w.snapshotPlayer('fireboy');
  if (!tp && b.y < 300) { tp = true; console.log(`TELEPORT f+${f} -> x=${b.x.toFixed(1)} y=${b.y.toFixed(1)}`); }
  if (tp && f % 10 === 0) console.log(`  f+${f} x=${b.x.toFixed(1)} y=${b.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);
  if (tp && w.players.fireboy.feetContacts.length >= 1 && f > 30 && b.y > 200 && b.y < 240 && b.x > 410) { console.log(`IN FB DOOR BAND f+${f} x=${b.x.toFixed(1)} y=${b.y.toFixed(1)}`); break; }
}
for (let f = 0; f < 80; f++) w.step(1 / 60, I);
a = w.snapshotPlayer('fireboy');
console.log(`END x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} feet=${(a.y + 35.2).toFixed(1)}`);
const doors = w.built?.doors;
console.log('fb door isOpen/isUp/frac:', doors.fireboy.isOpen, doors.fireboy.isUp, doors.fireboy.frac);

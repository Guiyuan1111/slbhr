// land on block west, walk to ~245, jump east through portal plane mid-air
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
// walk left to ~245
I.fireboy = { ...NONE, left: true };
for (let f = 0; f < 15; f++) { w.step(1 / 60, I); if (f % 5 === 0) { const c = w.snapshotPlayer('fireboy'); console.log(`  walkW f${f} x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`); } }
a = w.snapshotPlayer('fireboy');
console.log(`walked west x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);
// settle 40f, then standing jump east
I.fireboy = { ...NONE };
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
const c0 = w.snapshotPlayer('fireboy');
console.log(`settled x=${c0.x.toFixed(1)} y=${c0.y.toFixed(1)}`);
I.fireboy = { up: true, left: false, right: true };
w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
for (let f = 0; f < 200; f++) {
  w.step(1 / 60, I);
  const b = w.snapshotPlayer('fireboy');
  if (b.y < 300) { console.log(`TELEPORT f+${f} -> x=${b.x.toFixed(1)} y=${b.y.toFixed(1)}`); break; }
  if (f % 10 === 0) console.log(`  f+${f} x=${b.x.toFixed(1)} y=${b.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);
}
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
a = w.snapshotPlayer('fireboy');
console.log(`END x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} feet=${(a.y + 35.2).toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);

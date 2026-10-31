// Full gallery transit: step jump -> walk east into band -> teleport -> walk to door band -> door state
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const I = { fireboy: { ...NONE }, watergirl: { ...NONE } };
const F = w.players.fireboy.body;
F.SetPosition({ x: -112 / 32, y: -476.8 / 32 });
F.SetLinearVelocity({ x: 0, y: 0 });
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
// jump + hold right
I.fireboy = { up: true, left: false, right: true };
w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
let landed = false, tp = false;
for (let f = 0; f < 400; f++) {
  w.step(1 / 60, I);
  const a = w.snapshotPlayer('fireboy');
  if (!landed && a.y + 35.2 < 450 && w.players.fireboy.feetContacts.length >= 1 && f > 20) { landed = true; console.log(`landed f+${f} x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`); }
  if (!tp && a.y < 300) { tp = true; console.log(`TELEPORT f+${f} -> x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`); }
  if (tp && f % 20 === 0) console.log(`  f+${f} x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);
  if (a.x >= 450 && a.y > 200 && a.y < 240) { console.log(`IN DOOR BAND f+${f} x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`); break; }
}
const snap = w.snapshotPlayer('fireboy');
console.log(`END x=${snap.x.toFixed(1)} y=${snap.y.toFixed(1)}`);
// read door state via world internals
const doors = w.built?.doors || w.world?.built?.doors;
console.log('doors keys:', doors ? Object.keys(doors) : 'n/a');
try { console.log('fb door isOpen/isUp:', doors.fireboy.isOpen, doors.fireboy.isUp, 'frac', doors.fireboy.frac); } catch (e) { console.log('door read err', e.message); }

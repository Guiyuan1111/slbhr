// T1/T2: step(512)->block(448) jump; T4: portal transit. teleports, then scripted inputs.
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';

const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const inp = () => ({ fireboy: { ...NONE }, watergirl: { ...NONE } });
const F = w.players.fireboy.body;
F.SetPosition({ x: -112 / 32, y: -476.8 / 32 });
F.SetLinearVelocity({ x: 0, y: 0 });
let I = inp();
for (let f = 0; f < 40; f++) w.step(1 / 60, I);
let a = w.snapshotPlayer('fireboy');
console.log(`settle x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);

// T1: standing jump at edge with right hold 80f
I.fireboy = { up: true, left: false, right: true };
w.step(1 / 60, I);
I.fireboy = { ...NONE, right: true };
for (let f = 0; f < 119; f++) { w.step(1 / 60, I); if (f % 4 === 0) { a = w.snapshotPlayer('fireboy'); console.log(`T1 f+${f + 1} x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} g=${w.players.fireboy.feetContacts.length}`); } }
a = w.snapshotPlayer('fireboy');
console.log(`T1 END x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} feet=${(a.y + 35.2).toFixed(1)} g=${w.players.fireboy.feetContacts.length}`);

// wg top-route probe: hold right from spawn, watch the staircase flow
import { makeWorld } from '../../gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('forest_23');
const E = (f, k, t) => ({ f, k, t });
const evs = [E(2, 'right', 'down')];
function expandFlat(evs) {
  const a = { fireboy: {}, watergirl: {} };
  const list = [];
  for (const e of evs) list.push(e);
  return { a, list };
}
const { a } = { a: { fireboy: {}, watergirl: {} } };
const active = { fireboy: {}, watergirl: {} };
let ei = 0;
const T = Number(process.argv[2] ?? 900);
for (let f = 0; f < T; f++) {
  while (ei < evs.length && evs[ei].f <= f) {
    const e = evs[ei];
    if (e.t === 'down') active.watergirl[e.k] = true;
    else delete active.watergirl[e.k];
    ei++;
  }
  w.step(1/60, { fireboy: {}, watergirl: active.watergirl });
  const s = w.snapshotPlayer ? null : null;
  if (f % 15 === 0 || w.phase === 'won') {
    const p = w.built.pers ? null : null;
  }
  if (f % 15 === 0) {
    const st = w.state ? w.state.watergirl : null;
    if (st) console.log('f' + f, '(' + st.x.toFixed(1) + ',' + st.y.toFixed(1) + ') v(' + st.vx.toFixed(0) + ',' + st.vy.toFixed(0) + ') door=' + (w.built.doors.watergirl.frac ?? 0) + (w.phase === 'won' ? ' WON' : ''));
  }
  if (w.phase === 'won') { console.log('WON at f' + f); break; }
}
const fin = w.state ? w.state.watergirl : null;
if (fin) console.log('END f' + T, '(' + fin.x.toFixed(1) + ',' + fin.y.toFixed(1) + ') phase=' + w.phase);

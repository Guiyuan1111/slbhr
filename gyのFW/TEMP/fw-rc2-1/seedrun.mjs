// 跑 c0-c3-seed 双角色同时链，打印每段后位置
import { readFileSync } from 'node:fs';
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const seed = JSON.parse(readFileSync('/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-rc2-1/c0-c3-seed.json', 'utf8'));
const w = makeWorld('crystal_03');
const NONE = { up: false, left: false, right: false };
const mk = (name) => {
  // 原语: sleep(n) / hold(dir,n) / jumpDrift(dir,holdF,totalF)
  return function* () {
    for (const ev of seed[name]) {
      if (ev.n === 'sleep') { for (let i = 0; i < ev.a[0]; i++) yield NONE; }
      else if (ev.n === 'hold') { const d = ev.a[0] < 0 ? 'left' : 'right'; for (let i = 0; i < ev.a[1]; i++) yield { ...NONE, [d]: true }; }
      else if (ev.n === 'jumpDrift') {
        const d = ev.a[0] < 0 ? 'left' : 'right';
        for (let f = 0; f < ev.a[2]; f++) {
          if (f === 0) yield { ...NONE, up: true, [d]: true };
          else if (f <= ev.a[1]) yield { ...NONE, [d]: true };
          else yield NONE;
        }
      }
    }
  };
};
const gf = mk('sf')(), gg = mk('sw')();
const PF = () => w.snapshotPlayer('fireboy');
const PG = () => w.snapshotPlayer('watergirl');
let f = 0, tped = 0;
for (let seg = 0; seg < 200; seg++) {
  let done = false, n = 0;
  while (!done && n < 1000) {
    const a = gf.next(), b = gg.next();
    if (a.done && b.done) { done = true; break; }
    const inf = a.done ? NONE : a.value, ing = b.done ? NONE : b.value;
    const px = PF(), py = PG();
    w.step(1 / 60, { fireboy: inf, watergirl: ing });
    const nx = PF(), ny = PG();
    if (Math.abs(nx.x - px.x) > 50 || Math.abs(ny.y - py.y) > 50) console.log(`  f${f} FB-TP (${px.x.toFixed(1)},${(px.y+35.2).toFixed(1)})->(${nx.x.toFixed(1)},${(nx.y+35.2).toFixed(1)})`);
    if (Math.abs(ny.x - py.x) > 50 || Math.abs(ny.y - py.y) > 50) console.log(`  f${f} WG-TP (${py.x.toFixed(1)},${(py.y+35.2).toFixed(1)})->(${ny.x.toFixed(1)},${(ny.y+35.2).toFixed(1)})`);
    f++; n++;
  }
  const A = PF(), B = PG();
  console.log(`seg${seg} f=${f} fb x=${A.x.toFixed(1)} feet=${(A.y+35.2).toFixed(1)} | wg x=${B.x.toFixed(1)} feet=${(B.y+35.2).toFixed(1)}`);
  if (a_done()) break;
  function a_done() { return gf.next().done && true; }
}

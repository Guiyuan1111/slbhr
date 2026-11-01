// calib: 台面东段脱困标定 — 直接量各候选动作的落点
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const NONE = { up: false, left: false, right: false };
const PF = (w) => w.snapshotPlayer('fireboy');

function trial(tag, x0, feet0, acts) {
  const w = makeWorld('crystal_03');
  const B = w.players.fireboy.body;
  B.SetPosition({ x: -x0 / 32, y: -(feet0 - 35.2) / 32 });
  B.SetLinearVelocity({ x: 0, y: 0 });
  const step = (inp) => w.step(1 / 60, { fireboy: inp, watergirl: NONE });
  for (let i = 0; i < 30; i++) step(NONE);
  for (const a of acts) {
    if (a.t === 'walk') { // walk dir until line (max maxF)
      let f = 0;
      while (f < (a.maxF ?? 300)) {
        const p = PF(w);
        if (a.d > 0 ? p.x >= a.line : p.x <= a.line) break;
        step({ ...NONE, [a.d > 0 ? 'right' : 'left']: true }); f++;
      }
    } else if (a.t === 'holdF') { // press dir n frames
      for (let i = 0; i < a.n; i++) step({ ...NONE, [a.d > 0 ? 'right' : 'left']: true });
    } else if (a.t === 'jd') { // jd1f
      for (let f = 0; f < a.total; f++) {
        step(f === 0 ? { ...NONE, up: true, [a.d > 0 ? 'right' : 'left']: true } : (f <= (a.h ?? 0) ? { ...NONE, [a.d > 0 ? 'right' : 'left']: true } : NONE));
        const p = PF(w);
        if (f % 5 === 0) process.stdout.write(`(${p.x.toFixed(0)},${(p.y + 35.2).toFixed(0)}) `);
      }
    } else if (a.t === 'sleep') { for (let i = 0; i < a.n; i++) step(NONE); }
  }
  for (let i = 0; i < 80; i++) step(NONE);
  const p = PF(w);
  console.log(`\n[${tag}] END x=${p.x.toFixed(1)} feet=${(p.y + 35.2).toFixed(1)} g=${w.players.fireboy.feetContacts.length > 0 ? 1 : 0}`);
}

// 1) 柱顶(690,288) 东走出缘 → 落点?
trial('col-walkoffE', 690, 288, [{ t: 'walk', d: 1, line: 706, maxF: 200 }, { t: 'sleep', n: 60 }]);
// 2) 柱顶 jd1f(+1,h,40) h=0..6 → 落点
for (const h of [0, 2, 4, 6]) trial(`col-jdE-h${h}`, 690, 288, [{ t: 'sleep', n: 10 }, { t: 'jd', d: 1, h, total: 40 }, { t: 'sleep', n: 20 }]);
// 3) 板(750,416) 西走2步+jd1f(-1,40,110) 全弧 → 越碍条?
trial('slab-run-jdW', 750, 416, [{ t: 'walk', d: -1, line: 742, maxF: 100 }, { t: 'jd', d: -1, h: 40, total: 110 }, { t: 'sleep', n: 30 }]);
trial('slab-run-jdW2', 755, 416, [{ t: 'walk', d: -1, line: 746, maxF: 100 }, { t: 'jd', d: -1, h: 40, total: 110 }, { t: 'sleep', n: 30 }]);
// 4) 板站立 jd1f(-1,h,110) h=0,10,20
for (const h of [0, 10, 20]) trial(`slab-stand-jdW-h${h}`, 750, 416, [{ t: 'sleep', n: 10 }, { t: 'jd', d: -1, h, total: 110 }, { t: 'sleep', n: 30 }]);

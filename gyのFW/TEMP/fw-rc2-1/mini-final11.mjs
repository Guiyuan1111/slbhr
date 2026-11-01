// mini-final11: 方向互换方案 — fb jd(+1) 出东室(门448), wg jd(-1) 出西室(门96)
// 依据: doors 实证 fb=(448,256) 东, wg=(96,256) 西; win=双门 isUp (world.ts checkEnd)
// wg 镜像 fb-p2 (从东侧入带 jd(-1) 出西), fb 镜像 wg-p1 (从西侧入带 jd(+1) 出东)
import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const NONE = { up: false, left: false, right: false };

function mkW() {
  const w = makeWorld('crystal_03');
  const step = (fb, wg) => w.step(1 / 60, { fireboy: fb, watergirl: wg });
  for (const r of ['fireboy', 'watergirl']) {
    const B = w.players[r].body;
    B.SetPosition({ x: -560 / 32, y: -(576 - 35.2) / 32 });
    B.SetLinearVelocity({ x: 0, y: 0 });
  }
  for (let i = 0; i < 40; i++) step(NONE, NONE);
  return { w, step };
}
const PG = (w) => w.snapshotPlayer('watergirl');
const PF = (w) => w.snapshotPlayer('fireboy');

// walk role toward line (dir auto). returns frames used
function walk(w, step, role, line, maxF = 500) {
  const P = role === 'fb' ? PF : PG;
  const key = role === 'fb' ? 'fireboy' : 'watergirl';
  let f = 0;
  while (f < maxF) {
    const a = P(w);
    if (a.x <= line + 0.001) break;
    step(...(role === 'fb' ? [{ ...NONE, left: true }, NONE] : [NONE, { ...NONE, left: true }]));
    f++;
  }
  return f;
}

// jd arc; returns {tp, tpPos, end}
function jd(w, step, role, dir, holdF = 40, totalF = 110) {
  const P = role === 'fb' ? PF : PG;
  let tp = null, last = P(w);
  for (let f = 0; f < totalF; f++) {
    const d = dir < 0 ? 'left' : 'right';
    const inp = f === 0 ? { ...NONE, up: true, [d]: true } : (f <= holdF ? { ...NONE, [d]: true } : NONE);
    const px = last.x, py = last.y;
    step(...(role === 'fb' ? [inp, NONE] : [NONE, inp]));
    const a = P(w);
    if (!tp && (Math.abs(a.y - py) > 50 || Math.abs(a.x - px) > 50)) tp = `(${px.toFixed(1)},${(py + 35.2).toFixed(1)})->(${a.x.toFixed(1)},${(a.y + 35.2).toFixed(1)})`;
    last = a;
  }
  return { tp, end: P(w) };
}

// ---- 扫描 A: wg jd(-1) (fb 先停 680; wg 560->430, pause NW, ->392, sleep30, jd W)
function scanW(NW) {
  const { w, step } = mkW();
  let f = 0; while (f < 300 && PF(w).x < 680) { step({ ...NONE, right: true }, NONE); f++; }
  walk(w, step, 'wg', 430);
  for (let i = 0; i < NW; i++) step(NONE, NONE);
  walk(w, step, 'wg', 392);
  for (let i = 0; i < 30; i++) step(NONE, NONE);
  const tk = PG(w).x;
  const r = jd(w, step, 'wg', -1);
  console.log(`[wgW p${NW}] takeoff=${tk.toFixed(2)} end x=${r.end.x.toFixed(1)} feet=${(r.end.y + 35.2).toFixed(1)} ${r.tp ? '!!TP ' + r.tp : 'no-tp'}`);
  return { tp: !!r.tp, end: r.end };
}

// ---- 扫描 B: fb jd(+1) (wg 先按 pNW 完成 jdW 离场; fb 680->200, pause NF, ->163, sleep25, jd E)
function scanF(NW, NF) {
  const { w, step } = mkW();
  let f = 0; while (f < 300 && PF(w).x < 680) { step({ ...NONE, right: true }, NONE); f++; }
  walk(w, step, 'wg', 430);
  for (let i = 0; i < NW; i++) step(NONE, NONE);
  walk(w, step, 'wg', 392);
  for (let i = 0; i < 30; i++) step(NONE, NONE);
  const rw = jd(w, step, 'wg', -1);
  walk(w, step, 'fb', 200);
  for (let i = 0; i < NF; i++) step(NONE, NONE);
  walk(w, step, 'fb', 163);
  for (let i = 0; i < 25; i++) step(NONE, NONE);
  const tk = PF(w).x;
  const r = jd(w, step, 'fb', +1);
  console.log(`[fbE p${NF} wgNW=${NW} wgTP=${rw.tp}] takeoff=${tk.toFixed(2)} end x=${r.end.x.toFixed(1)} feet=${(r.end.y + 35.2).toFixed(1)} ${r.tp ? '!!TP ' + r.tp : 'no-tp'}`);
  return { tp: !!r.tp, end: r.end };
}

const mode = process.argv[2] || 'scan';
if (mode === 'scan') {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) scanW(n);
  console.log('--- fb jdE scan (wg NW=best fixed later; use NW=0 placeholder) ---');
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) scanF(0, n);
}

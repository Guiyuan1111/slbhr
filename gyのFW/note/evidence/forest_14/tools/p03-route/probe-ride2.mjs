/**
 * D1b: 全真实走位（无传送）：r14 斜坡底 (560,448) 出发 → 持右上 mega → 跨板翻板
 *      → 被倒东端 → 回走上板西冲 → x/feet 窗口起跳 → 高台落点。
 * D3b: 高台西缘 (330,192) 走/跳落 → r13 岛 → 西落 runway。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;
const sf = (w, role) => { const s = w.snapshotPlayer(role); return [ +s.x.toFixed(0), +(s.y + HALF).toFixed(0) ]; };
const ang = (w) => { const a = w.mechs.romans[0].bar.GetAngle(); return +(-a * 180 / Math.PI).toFixed(0); };
const P = (w) => w.snapshotPlayer("fireboy");

console.log("== D1b 真实走位翻板+西冲跳 ==");
{
  const w = makeWorld("forest_14");
  // 从 mega 平台西端出发（r14 斜坡顶东侧），持右一路走（C4 已证会翻板被倒东端）
  let tr = [], dumped = false, dumpF = -1;
  for (let f = 0; f < 500 && !dumped; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    const s = P(w);
    if (f % 20 === 0) tr.push([f, ...sf(w, "fireboy"), "a" + ang(w)]);
    if (s.dead || s.dying) { console.log("死", f, sf(w, "fireboy")); break; }
    if (f > 80 && s.x > 1050 && Math.abs(s.vx) < 3 && Math.abs(s.vy) < 3) { dumped = true; dumpF = f; }
  }
  console.log("被倒:", dumped, "f" + dumpF, JSON.stringify(sf(w, "fireboy")), "ang", ang(w));
  // 回西上板：持左，监控板角与位置；窗口 [620,790]×feet(200,340) 起跳
  let tr2 = [], jumped = false, jf = -1;
  for (let f = 0; f < 320; f++) {
    const s = P(w);
    let inp = { ...IDLE, left: true };
    if (!jumped && s.x < 790 && s.x > 600 && s.y + HALF < 345 && s.y + HALF > 190) {
      inp = { ...IDLE, left: true, up: true }; jumped = true; jf = f;
    }
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    const s2 = P(w);
    if (f % 8 === 0 || (jumped && f - jf < 6)) tr2.push([f, ...sf(w, "fireboy"), jumped ? "J" : "", "a" + ang(w)]);
    if (s2.dead || s2.dying) { tr2.push(["DEAD", f, ...sf(w, "fireboy")]); break; }
    if (jumped && f - jf > 25 && Math.abs(s2.vy) < 4 && Math.abs(s2.vx) < 4) { tr2.push(["LAND", f, ...sf(w, "fireboy")]); break; }
  }
  console.log(JSON.stringify(tr2));
}
console.log("== D3b 高台西缘降（330,192 走西）==");
{
  const w = makeWorld("forest_14");
  // 传送至高台（西侧）——高台中段走到西缘
  const c = w.players.fireboy; const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-420 / 32, -(192 - HALF) / 32));
  const tr = [];
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
    const s = P(w);
    if (f % 15 === 0) tr.push([f, ...sf(w, "fireboy")]);
    if (s.dead || s.dying) { tr.push(["DEAD", f]); break; }
    if (f > 40 && Math.abs(s.vy) < 4 && Math.abs(s.vx) < 4 && s.y + HALF > 350) { tr.push(["LAND", f, ...sf(w, "fireboy")]); break; }
  }
  console.log(JSON.stringify(tr));
  // 再西落下 runway
  const tr2 = [];
  for (let f = 0; f < 200; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
    const s = P(w);
    if (f % 15 === 0) tr2.push([f, ...sf(w, "fireboy")]);
    if (f > 30 && Math.abs(s.vy) < 4 && Math.abs(s.vx) < 4 && s.y + HALF > 350) { tr2.push(["REST", f, ...sf(w, "fireboy")]); break; }
  }
  console.log(JSON.stringify(tr2));
}

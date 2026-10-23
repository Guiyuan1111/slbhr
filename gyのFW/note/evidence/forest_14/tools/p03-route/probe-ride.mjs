/**
 * P-03 骑行/回落补探：
 *  D1: 板已西高（先翻板），fb 从东端 (1105,416) 西行冲板跳高台。
 *  D2: 风井 bob 漂东出柱 → 落 (128,448) 斜坡 → 持右上 runway。
 *  D3: 高台东缘 (570,192) 走落 → 落点。
 *  D4: runway 西行至 292 终跳（自走进入，含 d7 核验）→ 门台 → 门位。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;

function tp(w, role, x, feetY) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32));
  c.body.SetLinearVelocity(new V(0, 0));
}
const sf = (w, role) => { const s = w.snapshotPlayer(role); return [ +s.x.toFixed(0), +(s.y + HALF).toFixed(0) ]; };
const ang = (w) => { const a = w.mechs.romans[0].bar.GetAngle(); return +(-a * 180 / Math.PI).toFixed(0); };
const dead = (w, role) => { const s = w.snapshotPlayer(role); return s.dead || s.dying; };

console.log("== D1 板西高骑行：先 C4 式走到 1111 翻板，再西行冲板跳 ==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 600, 410);
  // 阶段1：持右走到被倒在东端
  let flipped = false;
  for (let f = 0; f < 400 && !flipped; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (dead(w, "fireboy")) { console.log("阶段1死", JSON.stringify(sf(w, "fireboy"))); break; }
    if (f > 60 && s.x > 1060 && Math.abs(s.vx) < 3 && Math.abs(s.vy) < 3) flipped = true;
  }
  console.log("翻板完成:", flipped, "pos", JSON.stringify(sf(w, "fireboy")), "ang", ang(w));
  // 阶段2：西行上板冲刺，x<780 且 feet<340 起跳
  let tr = [], jumped = false, jf = -1;
  for (let f = 0; f < 300; f++) {
    const s = w.snapshotPlayer("fireboy");
    let inp = { ...IDLE, left: true };
    if (!jumped && s.x < 780 && s.x > 620 && s.y + HALF < 340 && s.y + HALF > 200) { inp = { ...IDLE, left: true, up: true }; jumped = true; jf = f; }
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    if (f % 10 === 0 || (jumped && f - jf < 4)) tr.push([f, ...sf(w, "fireboy"), jumped ? "J" : "", "a" + ang(w)]);
    if (dead(w, "fireboy")) { tr.push(["DEAD", f, ...sf(w, "fireboy")]); break; }
    if (jumped && f - jf > 25 && Math.abs(w.snapshotPlayer("fireboy").vy) < 4 && Math.abs(w.snapshotPlayer("fireboy").vx) < 4) { tr.push(["LAND", f, ...sf(w, "fireboy")]); break; }
  }
  console.log(JSON.stringify(tr));
}
console.log("== D2 风井 bob 漂东出柱 ==");
{
  const w = makeWorld("forest_14");
  tp(w, "watergirl", 80, 630);
  const tr = [];
  let phase = "rise"; // rise->drift
  for (let f = 0; f < 420; f++) {
    const s = w.snapshotPlayer("watergirl");
    let inp = IDLE;
    if (phase === "rise" && s.y + HALF < 470 && s.y + HALF > 380) { phase = "drift"; }
    if (phase === "drift" && s.x < 150) inp = { ...IDLE, right: true };
    if (phase === "drift" && s.x >= 150) inp = { ...IDLE, right: true }; // 继续持右直到落定坡上
    w.step(1 / 60, { fireboy: IDLE, watergirl: inp });
    if (f % 20 === 0) tr.push([f, ...sf(w, "watergirl")]);
    if (dead(w, "watergirl")) { tr.push(["DEAD", f]); break; }
    if (f > 100 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4 && s.x > 126 && s.y + HALF > 420) { tr.push(["REST", f, ...sf(w, "watergirl")]); break; }
  }
  console.log(JSON.stringify(tr));
  // 接持右上 runway
  const tr2 = [];
  for (let f = 0; f < 200; f++) {
    w.step(1 / 60, { fireboy: IDLE, watergirl: { ...IDLE, right: true } });
    const s = w.snapshotPlayer("watergirl");
    if (f % 20 === 0) tr2.push([f, ...sf(w, "watergirl")]);
    if (s.x > 250 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4) { tr2.push(["ONRUNWAY", f, ...sf(w, "watergirl")]); break; }
  }
  console.log("上行:", JSON.stringify(tr2));
}
console.log("== D3 高台东缘走落 ==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 560, 182); // 高台上
  const tr = [];
  for (let f = 0; f < 240; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (f % 15 === 0) tr.push([f, ...sf(w, "fireboy")]);
    if (dead(w, "fireboy")) { tr.push(["DEAD", f]); break; }
    if (f > 30 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4 && s.y + HALF > 350) { tr.push(["LAND", f, ...sf(w, "fireboy")]); break; }
  }
  console.log(JSON.stringify(tr));
}
console.log("== D4 runway 西行→292 终跳→门台→门位（fb；d7 核验）==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 300, 374);
  let d7 = false;
  // 走到 292
  for (let f = 0; f < 120; f++) {
    const s = w.snapshotPlayer("fireboy");
    const inp = s.x > 292 ? { ...IDLE, left: true } : IDLE;
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    if (w.built.diamonds[7]?.collected) d7 = true;
  }
  console.log("走到292:", JSON.stringify(sf(w, "fireboy")), "d7:", d7);
  // 终跳：left+up 60f
  const tr = [];
  for (let f = 0; f < 120; f++) {
    const inp = f < 60 ? { ...IDLE, left: true, up: true } : IDLE;
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (f % 10 === 0) tr.push([f, ...sf(w, "fireboy")]);
    if (dead(w, "fireboy")) { tr.push(["DEAD", f]); break; }
  }
  console.log("终跳:", JSON.stringify(tr));
  // 走到 fb 门 x=96
  for (let f = 0; f < 200; f++) {
    const s = w.snapshotPlayer("fireboy");
    const inp = Math.abs(s.x - 96) < 4 ? IDLE : (s.x > 96 ? { ...IDLE, left: true } : { ...IDLE, right: true });
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    if (f % 25 === 0) tr.push([f, ...sf(w, "fireboy")]);
  }
  console.log("门位:", JSON.stringify(sf(w, "fireboy")), "atDoor:", w.snapshotPlayer("fireboy").atDoor);
}

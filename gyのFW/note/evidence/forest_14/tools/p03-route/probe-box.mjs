/**
 * P-03 东塔+箱子+锚定冲板 三段联测（一个世界内时序推进）：
 *  T1: wg 先东行跨板（翻板 east-down）。
 *  T2: fb 东塔登顶：mega(1130)→SLP_A→384块→352→320台→西跳 r6 SLP_B→NE台(192)。
 *  T3: fb 西推箱出缘 → 观察落点（板东端?）与板角。
 *  T4: 箱锚定下 fb 从板东端(1035)西冲：尖端高度/窗口/起跳→高台落点。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;
const P = (w, role) => { const s = w.snapshotPlayer(role); return [ +s.x.toFixed(0), +(s.y + HALF).toFixed(0) ]; };
const ang = (w) => { const a = w.mechs.romans[0].bar.GetAngle(); return +(-a * 180 / Math.PI).toFixed(0); };
const boxPos = (w) => { const b = w.mechs.props.find((p) => p.kind === "box"); const p = b.body.GetPosition(); return [ +(-p.x * 32).toFixed(0), +(-p.y * 32).toFixed(0) ]; };
const dead = (w, r) => { const s = w.snapshotPlayer(r); return s.dead || s.dying; };

function tp(w, role, x, feetY) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32));
  c.body.SetLinearVelocity(new V(0, 0));
}
function settle(w, n = 60) { for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE }); }

const w = makeWorld("forest_14");
// 板初始静置
settle(w, 200);
console.log("初始: 板角", ang(w), "箱", boxPos(w));

// T1: wg 东行跨板翻板（tp mega 西 600）
tp(w, "watergirl", 600, 410);
let t1 = [];
for (let f = 0; f < 400; f++) {
  w.step(1 / 60, { fireboy: IDLE, watergirl: { ...IDLE, right: true } });
  if (f % 40 === 0) t1.push([f, ...P(w, "watergirl"), "a" + ang(w)]);
  if (dead(w, "watergirl")) { t1.push(["DEAD", f]); break; }
  const s = w.snapshotPlayer("watergirl");
  if (f > 100 && s.x > 1060 && Math.abs(s.vx) < 3 && Math.abs(s.vy) < 3) break;
}
console.log("T1 wg 翻板:", JSON.stringify(t1));
// wg 撤离到西（600）等
for (let f = 0; f < 300; f++) {
  const s = w.snapshotPlayer("watergirl");
  const i = s.x > 610 ? { ...IDLE, left: true } : IDLE;
  w.step(1 / 60, { fireboy: IDLE, watergirl: i });
  if (s.x < 615 && Math.abs(s.vx) < 3 && f > 60) break;
}
console.log("wg 撤至:", P(w, "watergirl"));

// T2: fb 东塔登顶（tp mega 东 1130）
tp(w, "fireboy", 1130, 410);
settle(w, 30);
let t2 = [];
let phase = "walkE";
for (let f = 0; f < 600; f++) {
  const s = w.snapshotPlayer("fireboy");
  let inp = IDLE;
  if (phase === "walkE") inp = { ...IDLE, right: true };
  else if (phase === "jw") inp = { ...IDLE, left: true, up: f === 0 };
  else if (phase === "up") inp = { ...IDLE, left: true };
  else inp = IDLE;
  w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
  if (phase === "walkE" && (f % 40 === 0)) t2.push([f, ...P(w, "fireboy")]);
  if (phase === "walkE" && s.x > 1215 && s.y + HALF < 330) { phase = "jw"; t2.push(["AT320", f, ...P(w, "fireboy")]); }
  else if (phase === "jw") {
    t2.push([f, ...P(w, "fireboy")]);
    if (!s.grounded && s.vy < 0 && f > 3) { /* rising */ }
    phase = "up";
  } else if (phase === "up") {
    if (f % 10 === 0) t2.push([f, ...P(w, "fireboy")]);
    if (s.x < 1128 && s.y + HALF < 210) { t2.push(["NE!", f, ...P(w, "fireboy")]); break; }
    if (dead(w, "fireboy")) { t2.push(["DEAD", f]); break; }
  }
}
console.log("T2 fb 登塔:", JSON.stringify(t2));

// T3: 推箱西出缘
let t3 = [];
for (let f = 0; f < 500; f++) {
  w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
  if (f % 25 === 0) t3.push([f, "fb", ...P(w, "fireboy"), "bx" + boxPos(w)[0], "a" + ang(w)]);
  if (dead(w, "fireboy")) { t3.push(["DEAD", f]); break; }
  const b = boxPos(w);
  if (b[1] > 300) { t3.push(["BOX-SETTLED", f, "box", b, "a" + ang(w)]); break; }
}
console.log("T3 推箱:", JSON.stringify(t3));
// 箱再沉降
for (let f = 0; f < 200; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
console.log("箱终态:", boxPos(w), "板角", ang(w), "fb@", P(w, "fireboy"));

// T4: 锚定冲板（fb 先回板东端）
// fb 推箱后大概在西侧某处；tp 回 (1035, 板东端高度)
{
  const [fx, fy] = P(w, "fireboy");
  tp(w, "fireboy", 1035, 410);
  settle(w, 20);
  let t4 = [], jumped = false, jf = -1;
  for (let f = 0; f < 320; f++) {
    const s = w.snapshotPlayer("fireboy");
    let inp = { ...IDLE, left: true };
    if (!jumped) {
      const ft = s.y + HALF;
      if (s.x < 705 && s.x > 620 && ft < 300 && ft > 190) { inp = { ...NONE_INP(), left: true, up: true }; jumped = true; jf = f; }
    }
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    const s2 = w.snapshotPlayer("fireboy");
    if (f % 8 === 0 || (jumped && f - jf < 5)) t4.push([f, ...P(w, "fireboy"), jumped ? "J" : "", "a" + ang(w)]);
    if (dead(w, "fireboy")) { t4.push(["DEAD", f]); break; }
    if (jumped && f - jf > 25 && Math.abs(s2.vy) < 4 && Math.abs(s2.vx) < 4) { t4.push(["LAND", f, ...P(w, "fireboy")]); break; }
  }
  console.log("T4 锚定冲板:", JSON.stringify(t4));
}
function NONE_INP() { return IDLE; }

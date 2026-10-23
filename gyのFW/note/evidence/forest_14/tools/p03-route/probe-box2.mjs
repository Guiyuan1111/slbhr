/**
 * P-03 B 系列联测：跳步登塔 → NE 台 → 推箱西落 → 板锚定观察 → 锚定冲板。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;
const P = (w, role) => { const s = w.snapshotPlayer(role); return [ +s.x.toFixed(0), +(s.y + HALF).toFixed(0) ]; };
const ang = (w) => { const a = w.mechs.romans[0].bar.GetAngle(); return +(-a * 180 / Math.PI).toFixed(0); };
const boxPos = (w) => { const b = w.mechs.props.find((p) => p.kind === "box"); const p = b.body.GetPosition(); return [ +(-p.x * 32).toFixed(0), +(-p.y * 32).toFixed(0) ]; };

function tp(w, role, x, feetY) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32));
  c.body.SetLinearVelocity(new V(0, 0));
}
function settle(w, n = 60) { for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE }); }
/** 刹停跳（bot 口径）：无输入到慢，1f up+dir，持 dir holdF */
function hop(w, role, dir, holdF, maxF = 200) {
  const key = dir === "left" ? "left" : "right";
  for (let f = 0; f < 60; f++) { // 刹停
    const s = w.snapshotPlayer(role);
    if (Math.abs(s.vx) < 10 && Math.abs(s.vy) < 10 && w.players[role].feetContacts.length > 0) break;
    w.step(1 / 60, { fireboy: role === "fireboy" ? IDLE : IDLE, watergirl: role === "watergirl" ? IDLE : IDLE });
  }
  for (let f = 0; f < maxF; f++) {
    const inp = f === 0 ? { up: true, [key]: true } : (f <= holdF ? { [key]: true } : IDLE);
    w.step(1 / 60, { fireboy: role === "fireboy" ? inp : IDLE, watergirl: role === "watergirl" ? inp : IDLE });
    const s = w.snapshotPlayer(role);
    if (s.dead || s.dying) return { dead: 1, at: P(w, role) };
    if (f > 20 && Math.abs(s.vy) < 4 && Math.abs(s.vx) < 4 && w.players[role].feetContacts.length > 0) return { land: P(w, role), f };
  }
  return { timeout: 1, at: P(w, role) };
}

const w = makeWorld("forest_14");
settle(w, 200);
console.log("B0 板角", ang(w), "箱", boxPos(w));

// B1: 塔跳步（fb 从 mega 1100 出发）
tp(w, "fireboy", 1100, 404); settle(w, 40);
console.log("B1a mega(1100)→384块:", JSON.stringify(hop(w, "fireboy", "right", 40)));
console.log("B1b →352块:", JSON.stringify(hop(w, "fireboy", "right", 36)));
console.log("B1c →320台:", JSON.stringify(hop(w, "fireboy", "right", 36)));
// 走到 1230（320台东端内侧）
for (let f = 0; f < 200; f++) {
  const s = w.snapshotPlayer("fireboy");
  const i = s.x < 1225 ? { ...IDLE, right: true } : IDLE;
  w.step(1 / 60, { fireboy: i, watergirl: IDLE });
  if (s.x >= 1220 && Math.abs(s.vx) < 10) break;
}
console.log("B1 站位:", P(w, "fireboy"));
// B2: 320台 → 西跳上 r6 SLP_B → 走上 NE
console.log("B2 320→SLP_B:", JSON.stringify(hop(w, "fireboy", "left", 40)));
let t = [];
for (let f = 0; f < 300; f++) {
  w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
  const s = w.snapshotPlayer("fireboy");
  if (f % 15 === 0) t.push(P(w, "fireboy"));
  if (s.dead || s.dying) { t.push(["DEAD"]); break; }
  if (s.x < 1128 && s.y + HALF < 210 && Math.abs(s.vx) < 5) { t.push(["NE", P(w, "fireboy")]); break; }
}
console.log("B2 SLP_B 上行:", JSON.stringify(t));

// B3: 推箱西出缘
t = [];
for (let f = 0; f < 420; f++) {
  w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
  if (f % 20 === 0) t.push([f, "fb" + P(w, "fireboy"), "bx" + boxPos(w), "a" + ang(w)]);
  const s = w.snapshotPlayer("fireboy");
  if (s.dead || s.dying) { t.push(["DEAD", f]); break; }
  if (f > 60 && s.x < 1000 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4) { t.push(["FB-SETTLED", f, P(w, "fireboy"), boxPos(w), ang(w)]); break; }
}
console.log("B3 推箱:", JSON.stringify(t));
for (let f = 0; f < 300; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
console.log("B3 终态: 箱", boxPos(w), "板", ang(w), "fb", P(w, "fireboy"));

// B4: 锚定冲板（fb tp 回板东端 1035）
tp(w, "fireboy", 1035, 406); settle(w, 30);
t = [];
let jumped = false, jf = -1;
for (let f = 0; f < 320; f++) {
  const s = w.snapshotPlayer("fireboy");
  let inp = { ...IDLE, left: true };
  if (!jumped) {
    const ft = s.y + HALF;
    if (s.x < 705 && s.x > 615 && ft < 305 && ft > 190) { inp = { left: true, up: true }; jumped = true; jf = f; }
  }
  w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
  const s2 = w.snapshotPlayer("fireboy");
  if (f % 8 === 0 || (jumped && f - jf < 6)) t.push([f, ...P(w, "fireboy"), jumped ? "J" : "", "a" + ang(w), "bx" + boxPos(w)[0]]);
  if (s2.dead || s2.dying) { t.push(["DEAD", f]); break; }
  if (jumped && f - jf > 22 && Math.abs(s2.vy) < 4 && Math.abs(s2.vx) < 4) { t.push(["LAND", f, ...P(w, "fireboy")]); break; }
}
console.log("B4 冲板:", JSON.stringify(t));

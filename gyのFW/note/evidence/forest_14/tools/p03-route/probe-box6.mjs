/**
 * 14_1 终极 choreo：fb 锚(655) → wg 4跳上+19面→跳上箱西半(倾覆翻板) →
 * wg 骑落 → fb 尖区(被抬起) → 双 tip 跳。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;
const ang = (w) => { const a = w.mechs.romans[0].bar.GetAngle(); return +(-a * 180 / Math.PI).toFixed(0); };
const P = (w, r) => { const s = w.snapshotPlayer(r); return [ +s.x.toFixed(0), +(s.y + HALF).toFixed(0) ]; };
const boxPos = (w) => { const b = w.mechs.props.find((p) => p.kind === "box"); const p = b.body.GetPosition(); return [ +(-p.x * 32).toFixed(0), +(-p.y * 32).toFixed(0) ]; };
function tp(w, role, x, feetY) {
  const c = w.players[role]; const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32)); c.body.SetLinearVelocity(new V(0, 0));
}
function settle(w, n = 60) { for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE }); }
function hop(w, role, dir, holdF) {
  for (let f = 0; f < 90; f++) { const s = w.snapshotPlayer(role); if (w.players[role].feetContacts.length > 0 && Math.abs(s.vx) < 10 && Math.abs(s.vy) < 10) break; w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE }); }
  let apex = false;
  for (let f = 0; f < 240; f++) {
    const inp = f === 0 ? { up: true, [dir]: true } : (f <= holdF ? { [dir]: true } : IDLE);
    w.step(1 / 60, { fireboy: role === "fireboy" ? inp : IDLE, watergirl: role === "watergirl" ? inp : IDLE });
    const s = w.snapshotPlayer(role);
    if (s.vy >= 0) apex = true;
    if (s.dead || s.dying) return { dead: P(w, role) };
    if (apex && f > 24 && Math.abs(s.vy) < 5 && Math.abs(s.vx) < 40 && w.players[role].feetContacts.length > 0) return { land: P(w, role), f };
  }
  return { timeout: P(w, role) };
}
function goX(w, role, x) {
  for (let f = 0; f < 240; f++) {
    const s = w.snapshotPlayer(role); const d = x - s.x;
    const i = Math.abs(d) < 5 ? IDLE : (d > 0 ? { ...IDLE, right: true } : { ...IDLE, left: true });
    w.step(1 / 60, { fireboy: role === "fireboy" ? i : IDLE, watergirl: role === "watergirl" ? i : IDLE });
    if (Math.abs(d) < 8 && Math.abs(s.vx) < 10) return P(w, role);
  }
  return P(w, role);
}

const w = makeWorld("forest_14_1");
settle(w, 200);
tp(w, "fireboy", 620, 404); settle(w, 30);
console.log("fb 锚:", goX(w, "fireboy", 655), "a" + ang(w), "箱", boxPos(w));
tp(w, "watergirl", 620, 404); settle(w, 30);
for (const [i, h] of [26, 26, 26, 24].entries()) {
  const r = await hop(w, "watergirl", "right", h);
  console.log("wg 上" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (!r.land) process.exit(1);
}
// 跳上箱西半（扫 holdR 16/20/24 一次成功的即可——先试 20）
const rBox = await hop(w, "watergirl", "right", 20);
console.log("wg 跳箱:", JSON.stringify(rBox), "箱", boxPos(w), "a" + ang(w));
// 观察倾覆翻转 300f
let t = [];
for (let f = 0; f < 300; f++) {
  w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  if (f % 40 === 0) t.push([f, "wg" + P(w, "watergirl"), "bx" + boxPos(w), "a" + ang(w), "fb" + P(w, "fireboy")]);
}
console.log("倾覆观察:", JSON.stringify(t));
// wg 链 + tip
for (const [i, h] of [22, 22, 22, 16, 12].entries()) {
  const r = await hop(w, "watergirl", "left", h);
  console.log("wg 链" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (!r.land) process.exit(1);
}
console.log("wg tip:", JSON.stringify(await hop(w, "watergirl", "left", 60)), "a" + ang(w));
console.log("fb 现位:", P(w, "fireboy"), "a" + ang(w));
console.log("fb tip:", JSON.stringify(await hop(w, "fireboy", "left", 60)), "a" + ang(w));

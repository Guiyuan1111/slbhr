/**
 * 14_1 箱锚全链 v2：wg 锚(655) → fb 5跳上+19面(1025) → NE → 推箱砸翻 →
 * fb 回面链 → 双 tip 跳。
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
tp(w, "watergirl", 620, 404); settle(w, 30);
console.log("wg 锚:", goX(w, "watergirl", 655), "a" + ang(w));
tp(w, "fireboy", 620, 404); settle(w, 30);
for (const [i, h] of [26, 26, 26, 24].entries()) {
  const r = await hop(w, "fireboy", "right", h);
  console.log("fb 上" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (!r.land) process.exit(1);
}
console.log("fb NE 跳:", JSON.stringify(await hop(w, "fireboy", "right", 12)), "a" + ang(w), "箱", boxPos(w));
// 跳过箱到东侧，再向西推
console.log("fb 越箱跳:", JSON.stringify(await hop(w, "fireboy", "right", 24)), "箱", boxPos(w));
{
  let t = [];
  for (let f = 0; f < 360; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
    if (f % 30 === 0) t.push([f, "fb" + P(w, "fireboy"), "bx" + boxPos(w), "a" + ang(w), "wg" + P(w, "watergirl")]);
    const b = boxPos(w);
    if (b[1] > 250 && f > 40) { t.push(["BOX-DOWN", f, boxPos(w), "a" + ang(w), "wg" + P(w, "watergirl")]); break; }
  }
  console.log("推箱:", JSON.stringify(t));
}
for (let f = 0; f < 240; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
console.log("终态: 箱", boxPos(w), "板", ang(w), "fb", P(w, "fireboy"), "wg", P(w, "watergirl"));
// fb 回面 + 链
console.log("fb 回面:", JSON.stringify(await hop(w, "fireboy", "left", 44)), "a" + ang(w));
for (const [i, h] of [22, 22, 22, 16, 12].entries()) {
  const r = await hop(w, "fireboy", "left", h);
  console.log("fb 链" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (!r.land) process.exit(1);
}
console.log("fb tip:", JSON.stringify(await hop(w, "fireboy", "left", 60)), "a" + ang(w));
console.log("wg 现位:", P(w, "watergirl"), "a" + ang(w));
console.log("wg tip:", JSON.stringify(await hop(w, "watergirl", "left", 60)), "a" + ang(w));

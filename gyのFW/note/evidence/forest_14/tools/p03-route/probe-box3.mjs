/**
 * 14_1 箱锚全链：wg 锚+19西坡 → fb 跳东坡→NE→推箱落面（砸翻-19）→
 * fb 回面 → 双链上尖 → tip 跳高台。
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
console.log("初始 板", ang(w), "箱", boxPos(w));

// 1) wg 锚 +19 西坡：走到 (700, 375)
tp(w, "watergirl", 620, 404); settle(w, 30);
console.log("wg 锚位:", goX(w, "watergirl", 655), "a" + ang(w));

// 2) fb 跳东坡：[26, 26, 34, 26, 12] → NE
tp(w, "fireboy", 620, 404); settle(w, 30);
for (const [i, h] of [26, 26, 34, 26].entries()) {
  const r = await hop(w, "fireboy", "right", h);
  console.log("fb hop" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (!r.land) break;
}
// 3) 走西推箱（NE 上）
console.log("fb NE 位:", P(w, "fireboy"), "箱", boxPos(w));
{
  let t = [];
  for (let f = 0; f < 420; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, left: true }, watergirl: IDLE });
    if (f % 30 === 0) t.push([f, "fb" + P(w, "fireboy"), "bx" + boxPos(w), "a" + ang(w), "wg" + P(w, "watergirl")]);
    const b = boxPos(w);
    if (b[1] > 250 && f > 40) { t.push(["BOX-DOWN", f, boxPos(w), "a" + ang(w)]); break; }
  }
  console.log("推箱:", JSON.stringify(t));
}
for (let f = 0; f < 240; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
console.log("箱终态:", boxPos(w), "板", ang(w), "fb", P(w, "fireboy"), "wg", P(w, "watergirl"));

// 4) fb 回面（从 NE 西跳）
console.log("fb 回面跳:", JSON.stringify(await hop(w, "fireboy", "left", 40)), "a" + ang(w));
// 5) fb 链西上 [22,22,22,16,28] + tip 60
for (const [i, h] of [22, 22, 22, 16, 28].entries()) {
  const r = await hop(w, "fireboy", "left", h);
  console.log("fb 链" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (!r.land) break;
}
const ftip = await hop(w, "fireboy", "left", 60);
console.log("fb tip:", JSON.stringify(ftip), "a" + ang(w));
// 6) wg（应在尖区被抬起）链 + tip
console.log("wg 现位:", P(w, "watergirl"));
const wh = await hop(w, "watergirl", "left", 10);
console.log("wg 微跳:", JSON.stringify(wh));
const wtip = await hop(w, "watergirl", "left", 60);
console.log("wg tip:", JSON.stringify(wtip), "a" + ang(w));

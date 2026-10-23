/**
 * 14_1 人梯终解探针：wg 站西面(660) → fb [26,26,36] 越枢轴落东面(翻转+wg被抬起)
 * → fb [22,22] 链回 (720) → 跳上 wg 头 (680,206) → tip 跳高台 → wg 自跳。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;
const ang = (w) => { const a = w.mechs.romans[0].bar.GetAngle(); return +(-a * 180 / Math.PI).toFixed(0); };
const P = (w, r) => { const s = w.snapshotPlayer(r); return [ +s.x.toFixed(0), +(s.y + HALF).toFixed(0) ]; };
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
console.log("wg 站位:", goX(w, "watergirl", 668), "a" + ang(w));
tp(w, "fireboy", 620, 404); settle(w, 30);
for (const [i, h] of [26, 26].entries()) {
  const r = await hop(w, "fireboy", "right", h);
  console.log("fb 上" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w), "wg", P(w, "watergirl"));
  if (!r.land) process.exit(1);
}
// 长跳越枢轴
const rE = await hop(w, "fireboy", "right", 36);
console.log("fb 越枢轴:", JSON.stringify(rE), "a" + ang(w), "wg", P(w, "watergirl"));
// wg 在抬升窗内立即 tip 跳
const rw0 = await hop(w, "watergirl", "left", 56);
console.log("wg tip(窗内):", JSON.stringify(rw0), "a" + ang(w), "fb", P(w, "fireboy"));
// fb 2 长跳西链
const rc1 = await hop(w, "fireboy", "left", 48);
console.log("fb 长跳1:", JSON.stringify(rc1), "a" + ang(w));
const rc2 = await hop(w, "fireboy", "left", 44);
console.log("fb 长跳2:", JSON.stringify(rc2), "a" + ang(w));
const rt = await hop(w, "fireboy", "left", 60);
console.log("fb tip:", JSON.stringify(rt), "a" + ang(w), "wg", P(w, "watergirl"));

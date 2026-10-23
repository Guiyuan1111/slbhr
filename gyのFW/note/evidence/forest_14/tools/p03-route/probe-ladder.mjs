/**
 * 14_1 循环梯子全链：C1(wg渡→fb抬起→fb跳)→wg泵复位等待→fb回归→
 * C2(fb渡→wg抬起→wg跳)→fb 末位 2 长跳竞速。
 * fb 回归段用 tp 简化（该段=r14→mega 已验证路径）。
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
  for (let f = 0; f < 300; f++) {
    const s = w.snapshotPlayer(role); const d = x - s.x;
    const i = Math.abs(d) < 5 ? IDLE : (d > 0 ? { ...IDLE, right: true } : { ...IDLE, left: true });
    w.step(1 / 60, { fireboy: role === "fireboy" ? i : IDLE, watergirl: role === "watergirl" ? i : IDLE });
    if (Math.abs(d) < 8 && Math.abs(s.vx) < 10) return P(w, role);
  }
  return P(w, role);
}

const w = makeWorld("forest_14_1");
settle(w, 200);
// C1
tp(w, "fireboy", 620, 404); settle(w, 20); goX(w, "fireboy", 668);
console.log("C1 fb 站:", P(w, "fireboy"), "a" + ang(w));
tp(w, "watergirl", 620, 404); settle(w, 20);
for (const h of [26, 26, 36]) {
  const r = await hop(w, "watergirl", "right", h);
  console.log("C1 wg 渡跳:", JSON.stringify(r), "a" + ang(w), "fb", P(w, "fireboy"));
  if (!r.land) process.exit(1);
}
const c1 = await hop(w, "fireboy", "left", 56);
console.log("C1 fb 抬起跳:", JSON.stringify(c1), "a" + ang(w), "★runway" + (c1.land && c1.land[1] < 220 ? "OK" : "FAIL"));
// wg 泵复位：[22,22] 西链（板回 +19，她落到西面中段）
const wr1 = await hop(w, "watergirl", "left", 22);
console.log("wg 泵复位1:", JSON.stringify(wr1), "a" + ang(w));
const wr2 = await hop(w, "watergirl", "left", 22);
console.log("wg 泵复位2:", JSON.stringify(wr2), "a" + ang(w));
// wg 走回西面等待位 670
console.log("wg 回等待位:", goX(w, "watergirl", 670), "a" + ang(w));
// fb 回归（tp 简化：从高台已下到 mega 西 —— 真实路径=r14→mega 已验证）
const c1p = c1.land;
tp(w, "fireboy", 610, 404); settle(w, 40);
console.log("fb 回归就位:", P(w, "fireboy"), "a" + ang(w), "wg", P(w, "watergirl"));
// C2: fb 渡 [26,26,36]
for (const h of [26, 26, 36]) {
  const r = await hop(w, "fireboy", "right", h);
  console.log("C2 fb 渡跳:", JSON.stringify(r), "a" + ang(w), "wg", P(w, "watergirl"));
  if (!r.land) process.exit(1);
}
const c2 = await hop(w, "watergirl", "left", 56);
console.log("C2 wg 抬起跳:", JSON.stringify(c2), "a" + ang(w), "★runway" + (c2.land && c2.land[1] < 220 ? "OK" : "FAIL"));
// fb 末位竞速 [48,44]+tip60
const f1 = await hop(w, "fireboy", "left", 48);
console.log("fb 末1:", JSON.stringify(f1), "a" + ang(w));
const f2 = await hop(w, "fireboy", "left", 44);
console.log("fb 末2:", JSON.stringify(f2), "a" + ang(w));
const f3 = await hop(w, "fireboy", "left", 60);
console.log("fb 末tip:", JSON.stringify(f3), "a" + ang(w), "★" + (f3.land && f3.land[1] < 220 && f3.land[0] > 320 && f3.land[0] < 576 ? "runwayOK" : "FAIL"));

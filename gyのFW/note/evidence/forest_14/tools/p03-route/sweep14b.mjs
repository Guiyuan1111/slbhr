/**
 * 14_1 链尾参数矩阵：tandem 东渡 + wg 锚定 + fb 链[扫参] + wg 链[扫参]。
 * 输出各变体高台落点。
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
    if (Math.abs(d) < 8 && Math.abs(s.vx) < 10) return;
  }
}

async function runVariant(c5, tip, wgC5, wgTip) {
  const w = makeWorld("forest_14_1");
  settle(w, 200);
  // tandem：fb 先渡，wg 90f 后
  tp(w, "fireboy", 610, 404); settle(w, 20);
  tp(w, "watergirl", 600, 404);
  for (let f = 0; f < 600; f++) {
    const fi = { ...IDLE, right: true };
    const wi = f >= 90 ? { ...IDLE, right: true } : IDLE;
    w.step(1 / 60, { fireboy: fi, watergirl: wi });
    const fs = w.snapshotPlayer("fireboy"), ws = w.snapshotPlayer("watergirl");
    if (f > 150 && fs.x > 1060 && ws.x > 1060 && Math.abs(fs.vx) < 5 && Math.abs(ws.vx) < 5 && Math.abs(fs.vy) < 5 && Math.abs(ws.vy) < 5) break;
  }
  // wg 到锚位 1035
  goX(w, "watergirl", 1035);
  // fb 链 [22,22,22,16,c5,tip]
  const fch = [];
  for (const h of [22, 22, 22, 16]) { const r = await hop(w, "fireboy", "left", h); fch.push(r.land || r); if (!r.land) return { fch, fail: "fb-chain" }; }
  const f5 = await hop(w, "fireboy", "left", c5);
  const ft = await hop(w, "fireboy", "left", tip);
  const fbOk = ft.land && ft.land[1] < 220 && ft.land[0] > 320 && ft.land[0] < 576;
  // wg 链（无锚）
  const wch = [];
  for (const h of [20, 20, 20, 14]) { const r = await hop(w, "watergirl", "left", h); wch.push(r.land || r); if (!r.land) return { fch, ft, wch, fail: "wg-chain" }; }
  const w5 = await hop(w, "watergirl", "left", wgC5);
  const wt = await hop(w, "watergirl", "left", wgTip);
  const wgOk = wt.land && wt.land[1] < 220 && wt.land[0] > 320 && wt.land[0] < 576;
  return { fch, f5: f5.land, ft: ft.land, fbOk, wch, w5: w5.land, wt: wt.land, wgOk, endA: ang(w) };
}

for (const [c5, tip] of [[8, 60], [10, 60], [10, 64], [12, 64]]) {
  const r = await runVariant(c5, tip, 8, 64);
  console.log(`c5=${c5} tip=${tip}:`, JSON.stringify(r));
}

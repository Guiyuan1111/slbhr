/**
 * P-03 终段三轮（通用两关）：双人 tandem 东渡 → -19 东面短跳链 → 尖跳西落高台。
 * 单世界按实战时序：wg 先渡（90f 后 fb 渡）→ 各自链上。
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
/** 持右走到被倒东端（跨板） */
function crossEast(w, role) {
  for (let f = 0; f < 360; f++) {
    w.step(1 / 60, { fireboy: role === "fireboy" ? { ...IDLE, right: true } : IDLE, watergirl: role === "watergirl" ? { ...IDLE, right: true } : IDLE });
    const s = w.snapshotPlayer(role);
    if (s.dead || s.dying) return { dead: P(w, role) };
    if (f > 110 && s.x > 1060 && Math.abs(s.vx) < 5 && Math.abs(s.vy) < 5) return { dumped: P(w, role), f };
  }
  return { timeout: P(w, role) };
}

for (const level of ["forest_14", "forest_14_1"]) {
  console.log("========", level);
  const w = makeWorld(level);
  settle(w, 200);
  // tandem：wg 先渡，90f 后 fb 渡（同时开始：wg tp 板西根；fb 延迟 90f 由右键驱动）
  tp(w, "watergirl", 620, 404); settle(w, 20);
  tp(w, "fireboy", 600, 404);
  let fbStarted = false, crossLog = [];
  for (let f = 0; f < 500; f++) {
    const wi = { ...IDLE, right: true };
    const fi = f >= 90 ? { ...IDLE, right: true } : IDLE;
    w.step(1 / 60, { fireboy: fi, watergirl: wi });
    if (f % 30 === 0) crossLog.push([f, "wg" + P(w, "watergirl"), "fb" + P(w, "fireboy"), "a" + ang(w)]);
    const ws = w.snapshotPlayer("watergirl"), fs = w.snapshotPlayer("fireboy");
    if (ws.dead || ws.dying || fs.dead || fs.dying) { crossLog.push(["DEAD", f]); break; }
    if (f > 150 && ws.x > 1060 && fs.x > 1060 && Math.abs(ws.vx) < 5 && Math.abs(fs.vx) < 5 && Math.abs(ws.vy) < 5 && Math.abs(fs.vy) < 5) { crossLog.push(["BOTH-DUMPED", f]); break; }
  }
  console.log("tandem 渡:", JSON.stringify(crossLog.slice(-6)));
  // 各自链上（wg 先）：短跳链 holdL 20-24 ×4 + 尖跳 38
  const chainWg = [];
  for (let i = 0; i < 4; i++) { const r = await hop(w, "watergirl", "left", 22); chainWg.push(r); if (r.dead || r.timeout) break; }
  const tip1 = await hop(w, "watergirl", "left", 38);
  console.log("wg 链:", JSON.stringify(chainWg), "尖跳:", JSON.stringify(tip1), "a" + ang(w));
  const chainFb = [];
  for (let i = 0; i < 4; i++) { const r = await hop(w, "fireboy", "left", 22); chainFb.push(r); if (r.dead || r.timeout) break; }
  const tip2 = await hop(w, "fireboy", "left", 38);
  console.log("fb 链:", JSON.stringify(chainFb), "尖跳:", JSON.stringify(tip2), "a" + ang(w));
}

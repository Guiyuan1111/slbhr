/**
 * P-03 终段联测（一世界内按实战顺序）：
 *  W1: wg +19 西坡走到 820 → 大跳东坡 → 即刻西跳 → 高台落点。
 *  F1: fb（板已 -19）板下走廊走到 840 → 跳上面枢轴区 → 西链 → 尖跳 → 高台落点。
 * 两关各跑一遍。
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
/** bot 口径刹停跳 */
function hop(w, role, dir, holdF) {
  const key = dir;
  for (let f = 0; f < 90; f++) { const s = w.snapshotPlayer(role); if (w.players[role].feetContacts.length > 0 && Math.abs(s.vx) < 10 && Math.abs(s.vy) < 10) break; w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE }); }
  for (let f = 0; f < 220; f++) {
    const inp = f === 0 ? { up: true, [key]: true } : (f <= holdF ? { [key]: true } : IDLE);
    w.step(1 / 60, { fireboy: role === "fireboy" ? inp : IDLE, watergirl: role === "watergirl" ? inp : IDLE });
    const s = w.snapshotPlayer(role);
    if (s.dead || s.dying) return { dead: P(w, role) };
    if (f > 20 && Math.abs(s.vy) < 4 && Math.abs(s.vx) < 40 && w.players[role].feetContacts.length > 0) return { land: P(w, role), f };
  }
  return { timeout: P(w, role) };
}

for (const level of ["forest_14", "forest_14_1"]) {
  console.log("========", level);
  const w = makeWorld(level);
  settle(w, 200);
  // W1: wg tp 板西根 (620) 走东到 820（坡上）
  tp(w, "watergirl", 620, 404); settle(w, 30);
  for (let f = 0; f < 200; f++) {
    const s = w.snapshotPlayer("watergirl");
    const i = s.x < 816 ? { ...IDLE, right: true } : IDLE;
    w.step(1 / 60, { fireboy: IDLE, watergirl: i });
    if (s.x >= 812 && Math.abs(s.vx) < 15) break;
  }
  console.log("W1 走到:", P(w, "watergirl"), "a" + ang(w));
  // 大跳东坡（holdR 40）→ 即刻西跳（holdL 40）
  const r1 = await hop(w, "watergirl", "right", 40);
  console.log("W1 大跳东坡:", JSON.stringify(r1), "a" + ang(w));
  const r2 = await hop(w, "watergirl", "left", 40);
  console.log("W1 即刻西跳:", JSON.stringify(r2), "a" + ang(w));
  // 若已上高台则继续；否则报错
  const [wx, wy] = P(w, "watergirl");
  console.log("W1 终:", [wx, wy], wy < 220 ? "★高台OK" : "✗未上高台");

  // F1: fb 板下走廊 620→840 → 跳上面枢轴区 → 西链 → 尖跳
  tp(w, "fireboy", 620, 404); settle(w, 30);
  let blocked = null;
  for (let f = 0; f < 300; f++) {
    const s = w.snapshotPlayer("fireboy");
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    if (f % 30 === 0) console.log("  F1 走廊:", P(w, "fireboy"));
    if (s.x > 830 && Math.abs(s.vx) < 8) { blocked = P(w, "fireboy"); break; }
    if (Math.abs(s.vx) < 2 && f > 60 && s.x < 830) { blocked = ["STUCK", ...P(w, "fireboy")]; break; }
  }
  console.log("F1 走廊终:", JSON.stringify(blocked), "a" + ang(w));
  const f1 = await hop(w, "fireboy", "right", 26);
  console.log("F1 跳上面:", JSON.stringify(f1), "a" + ang(w));
  const f2 = await hop(w, "fireboy", "left", 26);
  console.log("F1 链1:", JSON.stringify(f2), "a" + ang(w));
  const f3 = await hop(w, "fireboy", "left", 26);
  console.log("F1 链2:", JSON.stringify(f3), "a" + ang(w));
  const f4 = await hop(w, "fireboy", "left", 38);
  console.log("F1 尖跳:", JSON.stringify(f4), "a" + ang(w));
  const [fx, fy] = P(w, "fireboy");
  console.log("F1 终:", [fx, fy], fy < 220 && fx > 320 && fx < 580 ? "★高台OK" : "?");
}

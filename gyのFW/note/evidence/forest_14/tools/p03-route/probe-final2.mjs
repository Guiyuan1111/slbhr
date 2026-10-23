/**
 * P-03 终段二轮：W1' holdR 扫参+即刻西跳；F1' 越底座跳+西链。
 * 每个变体独立世界（板态精确控制：W1' 从 +19 起；F1' 先复刻 W1' 使板 -19）。
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
/** 刹停跳（修：落地判定需 vy>0 下行段） */
function hop(w, role, dir, holdF) {
  for (let f = 0; f < 90; f++) { const s = w.snapshotPlayer(role); if (w.players[role].feetContacts.length > 0 && Math.abs(s.vx) < 10 && Math.abs(s.vy) < 10) break; w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE }); }
  let apex = false;
  for (let f = 0; f < 240; f++) {
    const inp = f === 0 ? { up: true, [dir]: true } : (f <= holdF ? { [dir]: true } : IDLE);
    w.step(1 / 60, { fireboy: role === "fireboy" ? inp : IDLE, watergirl: role === "watergirl" ? inp : IDLE });
    const s = w.snapshotPlayer(role);
    if (s.vy >= 0) apex = true;
    if (s.dead || s.dying) return { dead: P(w, role), a: ang(w) };
    if (apex && f > 24 && Math.abs(s.vy) < 5 && Math.abs(s.vx) < 40 && w.players[role].feetContacts.length > 0) return { land: P(w, role), f, a: ang(w) };
  }
  return { timeout: P(w, role), a: ang(w) };
}
/** 走到 x（刹停版） */
function walkTo(w, role, x) {
  for (let f = 0; f < 300; f++) {
    const s = w.snapshotPlayer(role);
    const d = x - s.x;
    const i = Math.abs(d) < 6 ? IDLE : (d > 0 ? { ...IDLE, right: true } : { ...IDLE, left: true });
    w.step(1 / 60, { fireboy: role === "fireboy" ? i : IDLE, watergirl: role === "watergirl" ? i : IDLE });
    if (Math.abs(d) < 8 && Math.abs(s.vx) < 12) return P(w, role);
  }
  return P(w, role);
}

console.log("== W1'：+19 面 (837,329) holdR 扫参 + 即刻西跳 ==");
for (const hr of [28, 30, 32, 34, 36]) {
  const w = makeWorld("forest_14");
  settle(w, 200);
  tp(w, "watergirl", 620, 404); settle(w, 30);
  walkTo(w, "watergirl", 820);
  const r1 = await hop(w, "watergirl", "right", hr);
  const r2 = await hop(w, "watergirl", "left", 40);
  const on = r2.land && r2.land[1] < 220 && r2.land[0] > 320 && r2.land[0] < 580;
  console.log("hr" + hr, "东跳:", JSON.stringify(r1), "→ 西跳:", JSON.stringify(r2), on ? "★高台!" : "");
}

console.log("== F1'：板-19（先 wg 触发翻转）→ fb 795 越底座跳 + 西链 ==");
for (const [hx, hr, chain] of [[795, 28, [24, 24, 38]], [800, 30, [24, 24, 38]], [790, 30, [26, 26, 40]]]) {
  const w = makeWorld("forest_14");
  settle(w, 200);
  // wg 先走东跨板（复刻：走到 820 → 持右到被倒）
  tp(w, "watergirl", 620, 404); settle(w, 30);
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: IDLE, watergirl: { ...IDLE, right: true } });
    const s = w.snapshotPlayer("watergirl");
    if (f > 100 && s.x > 1060 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4) break;
  }
  console.log(` [${hx}/${hr}] 板态: a${ang(w)} wg@${P(w, "watergirl")}`);
  tp(w, "fireboy", hx, 404); settle(w, 30);
  const f1 = await hop(w, "fireboy", "right", hr);
  console.log(` [${hx}/${hr}] 越底座跳:`, JSON.stringify(f1));
  const r2 = await hop(w, "fireboy", "left", chain[0]);
  const r3 = await hop(w, "fireboy", "left", chain[1]);
  const r4 = await hop(w, "fireboy", "left", chain[2]);
  console.log(` [${hx}/${hr}] 链:`, JSON.stringify([r2, r3, r4]));
}

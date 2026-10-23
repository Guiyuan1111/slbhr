/**
 * P-03 C 系列：跳链上板冲高台全链（单世界）：
 *  C1: fb 从 mega(620) 走/跳到 1100 → 跨板（翻+倒东端）。
 *  C2: B1a 式东跳 → 320 台(1200) → B2 西跳 → NE(1088,192)（撞飞箱）。
 *  C3: NE 走东 1100 → 西长跳回板东端 (1035,416)。
 *  C4: 跳链西上：hop(left)×3 → 最终窗跳 → 高台落点。
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

/** bot 口径刹停跳 */
function hop(w, role, dir, holdF, maxF = 200) {
  const key = dir;
  for (let f = 0; f < 90; f++) {
    const s = w.snapshotPlayer(role);
    if (w.players[role].feetContacts.length > 0 && Math.abs(s.vx) < 10 && Math.abs(s.vy) < 10) break;
    w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  }
  for (let f = 0; f < maxF; f++) {
    const inp = f === 0 ? { up: true, [key]: true } : (f <= holdF ? { [key]: true } : IDLE);
    w.step(1 / 60, { fireboy: role === "fireboy" ? inp : IDLE, watergirl: role === "watergirl" ? inp : IDLE });
    const s = w.snapshotPlayer(role);
    if (s.dead || s.dying) return { dead: 1, at: P(w, role) };
    if (f > 20 && Math.abs(s.vy) < 4 && Math.abs(s.vx) < 40 && w.players[role].feetContacts.length > 0) return { land: P(w, role), f };
  }
  return { timeout: 1, at: P(w, role) };
}

const w = makeWorld("forest_14");
settle(w, 200);

// C1: tp (620,416) 走东跨板到东端
tp(w, "fireboy", 620, 404); settle(w, 40);
{
  let log = [];
  for (let f = 0; f < 420; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (f % 30 === 0) log.push([f, ...P(w, "fireboy"), "a" + ang(w)]);
    if (s.dead || s.dying) { log.push(["DEAD", f]); break; }
    if (f > 120 && s.x > 1080 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4) { log.push(["END", f, ...P(w, "fireboy"), "a" + ang(w)]); break; }
  }
  console.log("C1 跨板:", JSON.stringify(log));
}

// C2: 塔 2 跳
console.log("C2a 东跳320台:", JSON.stringify(hop(w, "fireboy", "right", 40)));
console.log("C2b 西跳NE台:", JSON.stringify(hop(w, "fireboy", "left", 40)), "箱:", boxPos(w), "板:", ang(w));
// 走东到 1100（NE 台上，别掉西缘）
for (let f = 0; f < 120; f++) {
  const s = w.snapshotPlayer("fireboy");
  const i = s.x < 1098 ? { ...IDLE, right: true } : (s.x > 1112 ? { ...IDLE, left: true } : IDLE);
  w.step(1 / 60, { fireboy: i, watergirl: IDLE });
  if (Math.abs(s.x - 1105) < 6 && Math.abs(s.vx) < 10) break;
}
console.log("C2 NE 站位:", P(w, "fireboy"), "箱:", boxPos(w), "板:", ang(w));

// C3: 长跳西回板东端
console.log("C3 西长跳:", JSON.stringify(hop(w, "fireboy", "left", 52)), "板:", ang(w), "箱:", boxPos(w));

// C4: 跳链西上 ×3 + 窗口终跳
for (let i = 0; i < 3; i++) {
  const r = hop(w, "fireboy", "left", 34);
  console.log("C4 hop" + (i + 1) + ":", JSON.stringify(r), "a" + ang(w));
  if (r.dead || r.timeout) break;
}
// 终跳：持左，窗 (615,705) feet<300
{
  let t = [], jumped = false, jf = -1;
  for (let f = 0; f < 260; f++) {
    const s = w.snapshotPlayer("fireboy");
    let inp = { ...IDLE, left: true };
    if (!jumped) {
      const ft = s.y + HALF;
      if (s.x < 705 && s.x > 612 && ft < 302 && ft > 190) { inp = { left: true, up: true }; jumped = true; jf = f; }
    }
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    const s2 = w.snapshotPlayer("fireboy");
    if (f % 8 === 0 || (jumped && f - jf < 6)) t.push([f, ...P(w, "fireboy"), jumped ? "J" : "", "a" + ang(w)]);
    if (s2.dead || s2.dying) { t.push(["DEAD", f]); break; }
    if (jumped && f - jf > 22 && Math.abs(s2.vy) < 4 && Math.abs(s2.vx) < 4) { t.push(["LAND", f, ...P(w, "fireboy")]); break; }
  }
  console.log("C4 终跳:", JSON.stringify(t));
}

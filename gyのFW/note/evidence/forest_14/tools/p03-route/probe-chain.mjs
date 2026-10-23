/**
 * P-03 路线链补探：东岛链两跳、岛1→pyramid24、斜坡上行、风井升钻、
 * roman 骑行西跳高台、高台东降。全部从真实数据出生/传送起步。
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;

function tp(w, role, x, feetY) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32));
  c.body.SetLinearVelocity(new V(0, 0));
}
function settle(w, role, n = 90) {
  for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  return w.snapshotPlayer(role);
}
/** 起跳并持方向 hf 帧，每 5f 采样，直到静止/死/超时 */
function jump(w, role, dir, hf, maxF = 260) {
  const tr = [];
  const key = dir === "left" ? "left" : "right";
  for (let f = 0; f < maxF; f++) {
    const i = f <= hf ? { ...IDLE, [key]: true, up: f === 0 } : IDLE;
    // up 只按 1 帧（tap 跳）；持方向
    const inp = f === 0 ? { ...IDLE, [key]: true, up: true } : (f <= hf ? { ...IDLE, [key]: true } : IDLE);
    w.step(1 / 60, { fireboy: role === "fireboy" ? inp : IDLE, watergirl: role === "watergirl" ? inp : IDLE });
    const s = w.snapshotPlayer(role);
    if (f % 5 === 0) tr.push([f, +s.x.toFixed(0), +(s.y + HALF).toFixed(0)]);
    if (s.dead || s.dying) return { dead: true, f, x: +s.x.toFixed(0), feet: +(s.y + HALF).toFixed(0) };
    if (f > 25 && Math.abs(s.vy) < 4 && Math.abs(s.vx) < 4 && s.y + HALF > 100 && !inAirApex(s)) return { landed: { f, x: +s.x.toFixed(1), feet: +(s.y + HALF).toFixed(1) }, tr };
  }
  return { timeout: true, tr };
}
function inAirApex(s) { return false; } // 已过 apex 检测：用 vy 与 grounded 近似不可得，靠 f>25 门槛

console.log("== C1 island1→pyramid24（rise32 gap96）==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 300, 780); settle(w, "fireboy");
  console.log(JSON.stringify(jump(w, "fireboy", "right", 45)));
}
console.log("== C2 r25east→r22east（rise96 gap32）==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 1100, 780); settle(w, "fireboy");
  console.log(JSON.stringify(jump(w, "fireboy", "right", 50)));
}
console.log("== C3 r22east→r19east（rise96 gap64）==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 1230, 680); settle(w, "fireboy");
  console.log(JSON.stringify(jump(w, "fireboy", "left", 50)));
}
console.log("== C4 斜坡上行：井底(128,448)→runway 384（持右 240f）==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 132, 440); settle(w, "fireboy");
  const tr = [];
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (f % 20 === 0) tr.push([f, +s.x.toFixed(0), +(s.y + HALF).toFixed(0)]);
    if (s.dead || s.dying) { tr.push(["DEAD", f]); break; }
    if (f > 30 && s.x > 250 && Math.abs(s.vx) < 4) { tr.push(["REST", f, +s.x.toFixed(0), +(s.y + HALF).toFixed(0)]); break; }
  }
  console.log(JSON.stringify(tr));
}
console.log("== C5 风井上升：r20 站 x80 无输入（风自动升）+ 采钻核验 ==");
{
  const w = makeWorld("forest_14");
  tp(w, "fireboy", 80, 630); // 站 r20 平台顶部（风柱内）
  const tr = []; let gotD6 = false;
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (f % 20 === 0) tr.push([f, +s.x.toFixed(0), +(s.y + HALF).toFixed(0)]);
    const dl = w.built.diamonds.filter(d => d.collected).length;
    if (dl > 0 && !gotD6) { gotD6 = true; tr.push(["GOT", f, +s.x.toFixed(0), +(s.y + HALF).toFixed(0)]); }
    if (f > 200 && Math.abs(s.vy) < 3 && Math.abs(s.vx) < 3) break;
  }
  console.log(JSON.stringify({ gotD6, tr }));
}
console.log("== C6 roman 骑行：翻板后西端冲刺跳高台（fb 全流程）==");
{
  const w = makeWorld("forest_14");
  // fb 从 mega 平台西侧走上板（东行翻板）
  tp(w, "fireboy", 600, 404);
  let tr = [];
  for (let f = 0; f < 200; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    const s = w.snapshotPlayer("fireboy");
    if (f % 20 === 0) tr.push([f, +s.x.toFixed(0), +(s.y + HALF).toFixed(0)]);
    const s2 = w.snapshotPlayer("fireboy");
    if (f > 40 && Math.abs(s2.vx) < 3 && Math.abs(s2.vy) < 3 && s2.x > 1050) break;
  }
  console.log("翻板段:", JSON.stringify(tr));
  // 板已西高；fb 从板东端冲刺西行 + 起跳
  tr = [];
  const bar = () => { const a = w.mechs.romans[0].bar.GetAngle(); return (-a * 180 / Math.PI).toFixed(0); };
  let jumped = false, jf = 0;
  for (let f = 0; f < 300; f++) {
    let inp = { ...IDLE, left: true };
    const s = w.snapshotPlayer("fireboy");
    if (!jumped && s.x < 760 && s.x > 640 && s.y + HALF < 330) { inp = { ...IDLE, left: true, up: true }; jumped = true; jf = f; }
    w.step(1 / 60, { fireboy: inp, watergirl: IDLE });
    const s2 = w.snapshotPlayer("fireboy");
    if (f % 10 === 0 || (jumped && f - jf < 5)) tr.push([f, +s2.x.toFixed(0), +(s2.y + HALF).toFixed(0), jumped ? "J" : "-", "ang" + bar()]);
    if (s2.dead || s2.dying) { tr.push(["DEAD", f]); break; }
    if (jumped && f - jf > 30 && Math.abs(s2.vy) < 4 && Math.abs(s2.vx) < 4) { tr.push(["LAND", f, +s2.x.toFixed(0), +(s2.y + HALF).toFixed(0)]); break; }
  }
  console.log("冲刺跳段:", JSON.stringify(tr));
}

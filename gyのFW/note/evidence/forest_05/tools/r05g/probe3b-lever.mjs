// r05g2 probe3b: west704 杆2 摆臂机制实测（fbPrelude 送上西704 后跳舞）
// 用法：cd gyのFW && node --import tsx ../TEMP/r05g2/probe3b-lever.mjs
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const NONE = { up: false, left: false, right: false };
const ms = (w) => w.mechSnapshot();
const lev2On = (w) => ms(w).levers[1].state === 1;

function runJumpS(w, role, dir, line, holdF, st) {
  const i = { ...NONE, [dir]: true };
  const s = w.snapshotPlayer(role);
  const grounded = w.players[role].feetContacts.length > 0;
  if (!st.jumped) {
    if (grounded && (dir === "right" ? s.x >= line : s.x <= line)) { i.up = true; st.jumped = true; st.t = 0; }
    return i;
  }
  st.t++;
  if (st.t > holdF) return NONE;
  return i;
}
function creepJumpS(w, role, dir, preRun, holdF, st) {
  const i = { ...NONE, [dir]: true };
  const s = w.snapshotPlayer(role);
  const grounded = w.players[role].feetContacts.length > 0;
  if (st.phase === 0) { if (grounded && Math.abs(s.vx) < 30) st.phase = 1; return NONE; }
  if (st.phase === 1) { if (++st.t >= preRun) { i.up = true; st.phase = 2; st.t = 0; st.jumped = true; } return i; }
  st.t++;
  if (st.t > holdF) return NONE;
  return i;
}

const w = makeWorld("forest_05");
for (let f = 0; f < 30; f++) w.step(1 / 60, { fireboy: NONE, watergirl: NONE });
// fbPrelude: S1→P3西→S2走位→西跳西704→杆2首翻（probe1 逐字）
{
  const st1 = {}, st2 = {};
  let phase = 0;
  for (let f = 0; f < 900; f++) {
    let inp = NONE;
    if (phase === 0) {
      inp = runJumpS(w, "fireboy", "right", 450, 30, st1);
      const s = w.snapshotPlayer("fireboy");
      if (st1.jumped && w.players.fireboy.feetContacts.length > 0 && s.y < 830 && s.x > 504) phase = 1;
    } else if (phase === 1) {
      const s = w.snapshotPlayer("fireboy");
      const d = 548 - s.x;
      inp = Math.abs(d) > 4 ? { ...NONE, [d > 0 ? "right" : "left"]: true } : NONE;
      if (Math.abs(d) <= 4 && Math.abs(s.vx) < 40 && w.players.fireboy.feetContacts.length > 0) { phase = 2; st2.phase = 0; st2.t = 0; }
    } else if (phase === 2) {
      inp = creepJumpS(w, "fireboy", "left", 7, 45, st2);
      const s = w.snapshotPlayer("fireboy");
      if (st2.jumped && w.players.fireboy.feetContacts.length > 0 && s.y < 745 && s.x < 500) phase = 3;
    } else if (phase === 3) { // 杆2首翻：持L穿杆
      inp = { ...NONE, left: true };
      const s = w.snapshotPlayer("fireboy");
      if (lev2On(w) && s.x <= 412) break;
    }
    w.step(1 / 60, { fireboy: inp, watergirl: NONE });
  }
}
const lev = w.mechanisms.levers[1];
let f = 0;
const snap = (tag) => {
  const s = w.snapshotPlayer("fireboy");
  console.log(`f${f} ${tag} state=${lev.state} ang=${lev.angleDeg().toFixed(1)} fb=(${s.x.toFixed(1)},${s.y.toFixed(1)}) vx=${s.vx.toFixed(0)}`);
};
const seg = (name, dir, pred, maxF) => {
  const f0 = f;
  for (; f < f0 + maxF; f++) {
    const s = w.snapshotPlayer("fireboy");
    if (pred(s)) break;
    w.step(1 / 60, { fireboy: { ...NONE, [dir]: true }, watergirl: NONE });
    if ((f - f0) % 8 === 0) snap(name);
  }
  snap(name + " END");
};
snap("首翻毕");
seg("B东行出区", "right", (s) => s.x >= 470, 300);
seg("C西行再穿", "left", (s) => s.x <= 380, 300);
seg("D东行", "right", (s) => s.x >= 470, 300);
seg("E西行", "left", (s) => s.x <= 380, 300);
console.log("final lever2:", lev.state, "P3:", ms(w).platforms[2].x.toFixed(1));

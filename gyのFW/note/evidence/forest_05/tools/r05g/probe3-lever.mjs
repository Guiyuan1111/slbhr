// r05g2 probe3: west704 杆2 摆臂机制实测——state/armAngle/fb.x 逐帧日志
// 用法：cd gyのFW && node --import tsx ../TEMP/r05g2/probe3-lever.mjs
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const NONE = { up: false, left: false, right: false };
const w = makeWorld("forest_05");
for (let f = 0; f < 30; f++) w.step(1 / 60, { fireboy: NONE, watergirl: NONE });

const lev = w.mechanisms.levers[1];
const snap = (f, tag) => {
  const s = w.snapshotPlayer("fireboy");
  console.log(`f${f} ${tag} state=${lev.state} ang=${lev.angleDeg().toFixed(1)} fb=(${s.x.toFixed(1)},${s.y.toFixed(1)}) vx=${s.vx.toFixed(0)}`);
};

let f = 30;
const seg = async (name, dir, pred, maxF) => {
  const f0 = f;
  for (; f < f0 + maxF; f++) {
    const s = w.snapshotPlayer("fireboy");
    if (pred(s)) break;
    w.step(1 / 60, { fireboy: { ...NONE, [dir]: true }, watergirl: NONE });
    if ((f - f0) % 10 === 0) snap(f, name);
  }
  snap(f, name + " END");
};

await seg("A西行", "left", (s) => s.x <= 380, 300);
await seg("B东行", "right", (s) => s.x >= 470, 300);
await seg("C西行", "left", (s) => s.x <= 380, 300);
await seg("D东行", "right", (s) => s.x >= 470, 300);
console.log("final lever2 state:", lev.state, "P3 x:", w.mechSnapshot().platforms[2].x.toFixed(1));

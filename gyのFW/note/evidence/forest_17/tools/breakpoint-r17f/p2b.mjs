import { replay, fmtP } from "./lib17.mjs";
const L = "forest_17";
let jumped = false;
const r = replay(L, {
  ctrl: (w, f, s) => {
    if (f < 5) return {};
    if (!jumped) {
      if (s.fb.x <= 414) { jumped = true; console.log(`JUMP at f${f} x=${s.fb.x.toFixed(1)} vx=${s.fb.vx.toFixed(0)}`); return { fb: { left: true, up: true } }; }
      return { fb: { left: true } };
    }
    return { fb: { left: true } };
  },
}, 120, { sample: 3, tele: [{ f: 0, role: "fireboy", x: 700, feetY: 768 }] });
for (const s of r.samples) console.log(`f${s.f} ${fmtP(s)}`);

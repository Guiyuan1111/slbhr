// R2 精查：mesa→p10 平跳轨迹 + 走落对照
import { replay, teleport, fmtP } from "./lib17.mjs";
const L = "forest_17";
// A) 从 mesa 顶 x430 全速西行，x<=424 跳，逐帧采样
let jumped = false;
const r = replay(L, {
  tele: [{ f: 0, role: "fireboy", x: 430, feetY: 768 }],
  ctrl: (w, f, s) => {
    if (f < 5) return {};
    if (!jumped) {
      if (s.fb.x <= 424) { jumped = true; return { fb: { left: true, up: true } }; }
      return { fb: { left: true } };
    }
    return { fb: { left: true } };
  },
}, 130, { sample: 2, tele: [{ f: 0, role: "fireboy", x: 430, feetY: 768 }] });
for (const s of r.samples) if (s.f >= 0) console.log(`f${s.f} ${fmtP(s)}`);
console.log("end", r.endF, fmtP(r.endSnap));
// B) 起跳速度标定：站 mesa 顶原速起跳瞬间的 v
{
  const r2 = replay(L, {
    ctrl: (w, f, s) => (f < 5 ? {} : f < 20 ? { fb: { left: true } } : { fb: { left: true, up: true } }),
  }, 40, { sample: 1, tele: [{ f: 0, role: "fireboy", x: 430, feetY: 768 }] });
  for (const s of r2.samples) if (s.f >= 18 && s.f <= 30) console.log(`B f${s.f} ${fmtP(s)}`);
}

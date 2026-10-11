// 精调: 走廊内左跳 → 落 r22 (896-1024,704) → 西走 R928 → c27 坡 → 落 plat2 区
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
function run(drift, walkW) {
  const w = makeWorld("forest_21");
  const fb = w.chars.fireboy;
  const ev = [];
  const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
  add(3, {}); add(62, { l: 1 }); add(12, {}); add(52, { r: 1 }); add(120, {}); add(45, { l: 1 }); add(6, { u: 1 }); add(250, {});
  add(10, { r: 1 });
  ev.push({ l: 1, u: 1 });
  add(drift, { l: 1 });
  add(40, {});
  add(walkW, { l: 1 });
  while (ev.length < 1300) ev.push({});
  const lines = [];
  for (let f = 0; f < ev.length; f++) {
    w.step(1 / 60, { fireboy: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r }, watergirl: { ...IDLE } });
    if (f % 40 === 0 && f > 550 && f < 900) lines.push(`f${f}:${pos(fb).join(",")}`);
  }
  const col = w.diamonds.map(d => `${Math.round(d.x)},${Math.round(d.y)}:${d.collected ? 1 : 0}`).join(" ");
  console.log(`drift=${drift} walk=${walkW} | ${lines.join(" ")} final=${pos(fb).join(",")}\n  ${col}`);
}
for (const dr of [8, 12, 16]) run(dr, 90);

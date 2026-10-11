// fb: 全前缀到走廊(1050,701) → 左跳上 r22 → 西走 R928 → 判 R928 收集
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
function run(jumpAt, drift, walkW) {
  const w = makeWorld("forest_21");
  const fb = w.chars.fireboy;
  const ev = [];
  const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
  add(3, {}); add(62, { l: 1 }); add(12, {}); add(52, { r: 1 }); add(120, {}); add(45, { l: 1 }); add(6, { u: 1 }); add(250, {});
  // 此时约 f550 走廊(1050,701)；先右走出廊顶到东壁再折返？此前证: 走廊东走出廊→r24。这里直接在走廊内左跳上 r22
  add(jumpAt, { r: 1 });            // 东走贴东壁
  ev.push({ l: 1, u: 1 });          // 左跳
  add(drift, { l: 1 });
  add(40, {});
  add(walkW, { l: 1 });             // r22 上西走 R928
  while (ev.length < 1100) ev.push({});
  let trace = [];
  for (let f = 0; f < ev.length; f++) {
    w.step(1 / 60, { fireboy: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r }, watergirl: { ...IDLE } });
    if (f % 50 === 0 && f > 500) trace.push(`f${f}:${pos(fb).join(",")}`);
  }
  const r928 = w.diamonds.find(d => Math.round(d.x) === 928 && Math.round(d.y) === 656).collected;
  console.log(`jumpAt=${jumpAt} drift=${drift} walk=${walkW} R928=${r928} | ${trace.join(" ")} final=${pos(fb).join(",")}`);
}
for (const ja of [10, 20]) for (const dr of [25, 35]) run(ja, dr, 60);

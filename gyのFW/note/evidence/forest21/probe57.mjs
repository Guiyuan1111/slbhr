// 全速连续走西→起跳（不落停）→ 落 c30 台(960-992,704)/r22 顶 → 西走 R928
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
function run(preL, jf, holdL, walkW) {
  const w = makeWorld("forest_21");
  const fb = w.chars.fireboy;
  const ev = [];
  const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
  add(3, {}); add(62, { l: 1 }); add(12, {}); add(52, { r: 1 }); add(120, {}); add(45, { l: 1 }); add(6, { u: 1 }); add(250, {});
  add(30, { r: 1 }); add(200, {}); add(90, { l: 1 }); add(160, {});   // 到 lever0 前 (965.8,860.5)
  add(60, { r: 1 }); add(200, {});                                    // 折返东 → 走廊
  add(preL, { l: 1 });                                                // 全速西行(不停)
  ev.push({ l: 1, u: 1 });                                            // 不停步直接起跳
  add(jf, { l: 1, u: 1 });
  add(holdL, { l: 1 });
  add(walkW, { l: 1 });
  while (ev.length < 1500) ev.push({});
  const lines = [];
  for (let f = 0; f < ev.length; f++) {
    w.step(1 / 60, { fireboy: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r }, watergirl: { ...IDLE } });
    if (f % 30 === 0 && f > 780 && f < 1050) lines.push(`f${f}:${pos(fb).join(",")}`);
  }
  const r928 = w.diamonds.find(d => Math.round(d.x) === 928).collected;
  console.log(`preL=${preL} jf=${jf} hold=${holdL} walk=${walkW} R928=${r928} | ${lines.join(" ")} final=${pos(fb).join(",")}`);
}
run(150, 14, 10, 120);
run(155, 12, 10, 120);
run(145, 16, 10, 120);

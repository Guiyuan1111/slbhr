// 二段跳: 走廊左跳 → 落 c30 塔顶滑座 → 立即再左跳 → 落 r22 西带 → 西走 R928
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
function run(drift, wait, j2, walkW) {
  const w = makeWorld("forest_21");
  const fb = w.chars.fireboy;
  const ev = [];
  const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
  add(3, {}); add(62, { l: 1 }); add(12, {}); add(52, { r: 1 }); add(120, {}); add(45, { l: 1 }); add(6, { u: 1 }); add(250, {});
  add(10, { r: 1 });
  ev.push({ l: 1, u: 1 });
  add(drift, { l: 1 });
  add(wait, {});                    // 落座
  add(j2, { l: 1, u: 1 });          // 二段左跳
  add(60, { l: 1 });                // 空中左漂+落地西走
  add(walkW, { l: 1 });
  while (ev.length < 1400) ev.push({});
  const lines = [];
  for (let f = 0; f < ev.length; f++) {
    w.step(1 / 60, { fireboy: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r }, watergirl: { ...IDLE } });
    if (f % 40 === 0 && f > 550 && f < 950) lines.push(`f${f}:${pos(fb).join(",")}`);
  }
  const r928 = w.diamonds.find(d => Math.round(d.x) === 928).collected;
  console.log(`drift=${drift} wait=${wait} j2=${j2} walk=${walkW} R928=${r928} | ${lines.join(" ")} final=${pos(fb).join(",")}`);
}
run(16, 2, 6, 120);
run(16, 4, 6, 120);
run(14, 3, 6, 120);

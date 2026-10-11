// B512 漏洞检测: fb 底层西行至 x~512 → 原地跳顶 → 钻窗口[474,550]x[730,806] 是否覆盖
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
function run(walkW, jf) {
  const w = makeWorld("forest_21");
  const fb = w.chars.fireboy;
  const ev = [];
  const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
  add(3, {}); add(62, { l: 1 }); add(12, {}); add(52, { r: 1 }); add(120, {}); add(45, { l: 1 }); add(6, { u: 1 }); add(250, {});
  add(30, { r: 1 }); add(200, {}); add(90, { l: 1 }); add(160, {});   // probe44 前缀 → lever0 (965.8,860.5)
  add(walkW, { l: 1 });                                                // 西行向 x512
  add(8, {});
  add(jf, { u: 1 });                                                   // 原地跳
  add(60, {});
  while (ev.length < 1300) ev.push({});
  const lines = [];
  for (let f = 0; f < ev.length; f++) {
    w.step(1 / 60, { fireboy: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r }, watergirl: { ...IDLE } });
    if (f % 40 === 0 && f > 700) lines.push(`f${f}:${pos(fb).join(",")}`);
  }
  const b512 = w.diamonds.find(d => Math.round(d.x) === 512).collected;
  console.log(`walk=${walkW} jf=${jf} B512=${b512} | ${lines.join(" ")} final=${pos(fb).join(",")}`);
}
run(140, 25);
run(160, 25);

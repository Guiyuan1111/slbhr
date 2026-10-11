// wg 不楔死起跳: 短东行停在 x~415-425 → 立即跳东 → 落 c14 柱顶(640) → 东走出(480) → 穿 B512 窗[474,550]x[730,806]
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
function run(preE, jf, postE) {
  const w = makeWorld("forest_21");
  const wg = w.chars.watergirl;
  const ev = [];
  const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
  add(3, {}); add(120, { r: 1 }); add(87, { l: 1 }); add(60, {});
  add(preE, { r: 1 });
  add(jf, { u: 1, r: 1 });
  add(postE, { r: 1 });
  add(150, {});
  add(360, { l: 1 });     // 落地后西走去门
  while (ev.length < 1700) ev.push({});
  const lines = [];
  for (let f = 0; f < ev.length; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE }, watergirl: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r } });
    if (f % 40 === 0 && f > 380) lines.push(`f${f}:${pos(wg).join(",")}`);
  }
  const b512 = w.diamonds.find(d => Math.round(d.x) === 512).collected;
  const b672 = w.diamonds.find(d => Math.round(d.x) === 192 && Math.round(d.y) === 672).collected;
  const [x, y] = pos(wg);
  console.log(`preE=${preE} jf=${jf} postE=${postE} B512=${b512} B672=${b672} final=${x},${y} 距门=${Math.hypot(x - 96, y - 896).toFixed(0)}`);
}
run(195, 12, 60);
run(205, 12, 60);
run(215, 12, 60);

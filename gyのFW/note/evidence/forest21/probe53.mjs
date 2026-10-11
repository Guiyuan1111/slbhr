// wg 端到端 v2: 加长东行(穿楼梯上 r21 岛→东缘走出)→落底层→西走到门
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const pos = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
const w = makeWorld("forest_21");
const wg = w.chars.watergirl;
const ev = [];
const add = (n, e) => { for (let i = 0; i < n; i++) ev.push(e); };
add(3, {});
add(120, { r: 1 });
add(87, { l: 1 });
add(60, {});
add(350, { r: 1 });      // 东 cascade → r23 → 楼梯 → r21 岛 → 东缘
add(120, {});            // 走出岛落底层
add(420, { l: 1 });      // 底层西走 → 门
while (ev.length < 1400) ev.push({});
const lines = [];
for (let f = 0; f < ev.length; f++) {
  w.step(1 / 60, { fireboy: { ...IDLE }, watergirl: { up: !!ev[f].u, left: !!ev[f].l, right: !!ev[f].r } });
  if (f % 60 === 0) lines.push(`f${f}:${pos(wg).join(",")}`);
}
const ds = w.diamonds.map(d => `${Math.round(d.x)},${Math.round(d.y)}:${d.collected ? 1 : 0}`).join(" ");
const [x, y] = pos(wg);
console.log(lines.join(" "));
console.log(`final=${x},${y} 距门=${Math.hypot(x - 96, y - 896).toFixed(1)}`);
console.log(ds);

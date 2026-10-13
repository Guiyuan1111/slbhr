// 扰动回放追踪: 给定 route + 单事件 ±1f, 逐帧打印关键窗口, 定位死亡级联真因
import { makeWorld, expandFlat } from "../../scripts/e2e/routetool/kernel.mjs";
import { readFileSync } from "node:fs";
const route = JSON.parse(readFileSync(process.argv[5] || "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW/scripts/e2e/inputs/routes/forest_04.json", "utf8"));
// 用法: node ptrace-f04.mjs <side> <idx> <delta>
const side = process.argv[2] || "fb", idx = +(process.argv[3] || 0), delta = +(process.argv[4] || 1);
const doc = { level: route.level, totalFrames: route.totalFrames, fb: route.fb.map(e => ({ ...e })), wg: route.wg.map(e => ({ ...e })) };
doc[side][idx].f += delta;
console.log(`# 扰动 ${side}#${idx} f${route[side][idx].f}${delta > 0 ? "+1" : "-1"} (${route[side][idx].dir} ${route[side][idx].type})`);
const NONE = { up: false, left: false, right: false };
const insP = expandFlat(doc.fb, doc.wg, doc.totalFrames);
const w = makeWorld(route.level);
const pul = w.mechanisms.pulleys[0], box = w.mechanisms.props[0];
const topOf = (b) => -b.GetPosition().y * 32 - 4.4;
const cur = { fb: { ...NONE }, wg: { ...NONE } };
const idx2 = { fb: 0, wg: 0 };
for (let f = 0; f < doc.totalFrames; f++) {
  for (const s of ["fb", "wg"]) {
    while (idx2[s] < doc[s].length && doc[s][idx2[s]].f <= f) {
      const e = doc[s][idx2[s]++];
      cur[s][e.dir] = e.type === "down";
    }
  }
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  cur.fb = insP.fb[f]; cur.wg = insP.wg[f];
  const A = +(process.env.W0||0); const B = +(process.env.W1||9999); const inWin = (f >= A && f <= B && (f % 3 === 0));
  if (inWin) console.log(`t f${f} fb(${a.x.toFixed(1)},${(a.y+35.2).toFixed(1)}) vx${a.vx.toFixed(0)} vy${a.vy.toFixed(0)}${a.dead||a.dying?"死":""} wg(${b.x.toFixed(1)},${(b.y+35.2).toFixed(1)})${b.dead||b.dying?"死":""}`);
  w.step(1 / 60, { fireboy: insP.fb[f], watergirl: insP.wg[f] });
  if (a.dead || a.dying || b.dead || b.dying) { console.log(`死亡@f${f} fb(${a.x.toFixed(0)},${(a.y + 35.2).toFixed(0)}${a.dead || a.dying ? "死" : ""}) wg(${b.x.toFixed(0)},${(b.y + 35.2).toFixed(0)}${b.dead || b.dying ? "死" : ""})`); break; }
  if (w.phase === "won") { console.log(`WIN @f${f}`); break; }
}

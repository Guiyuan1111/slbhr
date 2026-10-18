/** 聚合 prof-client.mjs 输出的 JSON：分位数表 + 分配速率 */
import { readFileSync } from "node:fs";

const doc = JSON.parse(readFileSync(process.argv[2], "utf8"));
const fr = doc.frames;
if (!fr.length) { console.log("无帧"); process.exit(1); }
const q = (arr, p) => {
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
const col = (k) => fr.map((f) => f[k] ?? 0);
const ms = (v) => +(v).toFixed(3);

const dtMs = (fr[fr.length - 1].t - fr[0].t) || 1;
const fpsEff = (fr.length / dtMs) * 1000;

console.log(`mode=${doc.meta.mode} level=${doc.meta.level} renderer=${doc.renderer} children=${doc.sceneChildren} frames=${fr.length} 时长=${(dtMs / 1000).toFixed(1)}s 有效fps=${fpsEff.toFixed(1)} longtask=${doc.longtasks.length}`);
console.log(`dyn: ${JSON.stringify(doc.dyn)} mechCalls=${doc.mechCalls} (${(doc.mechCalls / (dtMs / 1000)).toFixed(0)}/s)`);
console.log(`heap: start=${doc.heap.startKB}KB end=${doc.heap.endKB}KB 分配≈${(doc.heap.allocKB / (dtMs / 1000)).toFixed(0)}KB/s gcDrops=${doc.heap.gcDrops.length}`);
for (const [k, name] of [["raw", "rawDelta"], ["total", "帧总"], ["update", "update段(含管理器+场景)"], ["render", "render段"], ["gsUpdate", "GameScene.update"], ["gsMechs", "updateMechs"], ["gsPlayers", "updatePlayers"], ["gsDiamonds", "updateDiamonds"]]) {
  const c = col(k).filter((v) => v > 0 || k === "raw");
  if (!c.length) continue;
  console.log(`${name.padEnd(24)} p50=${ms(q(c, 0.5))}ms p95=${ms(q(c, 0.95))}ms p99=${ms(q(c, 0.99))}ms avg=${ms(sum(c) / c.length)}ms max=${ms(Math.max(...c))}ms Σ=${ms(sum(c))}ms`);
}
const rawC = col("raw");
console.log(`rawDelta>20ms 帧数: ${rawC.filter((v) => v > 20).length} (>34ms: ${rawC.filter((v) => v > 34).length})`);
if (doc.longtasks.length) console.log("longtask TOP5:", doc.longtasks.sort((x, y) => y.dur - x.dur).slice(0, 5).map((l) => `${l.dur.toFixed(0)}ms`).join(" "));

// 每列全部实体区间（可判别顶面/顶棚/坡道）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_12_1");
const world = w["built"].world;
const fx = [];
for (let b = world.GetBodyList(); b; b = b.GetNext()) {
  if (b.GetType() !== 0) continue;
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) if (!f.IsSensor()) fx.push(f);
}
const pt = { x: 0, y: 0 };
const cols = [];
for (let x = 2; x < 1248; x += 4) {
  pt.x = -x / 32;
  const spans = [];
  let s = null;
  for (let y = 34; y <= 922; y += 2) {
    pt.y = -y / 32;
    let hit = false;
    for (const f of fx) { if (f.TestPoint(pt)) { hit = true; break; } }
    if (hit && s === null) s = y;
    if (!hit && s !== null) { spans.push([s, y - 2]); s = null; }
  }
  if (s !== null) spans.push([s, 922]);
  cols.push([x, spans]);
}
// 压缩：相邻列 spans 相同（±2px）合并
const key = (sp) => JSON.stringify(sp);
let prevK = null, start = 2, prevSp = null;
const out = [];
for (const [x, sp] of cols) {
  const k = key(sp);
  if (prevK === null) { prevK = k; prevSp = sp; start = x; continue; }
  if (k !== prevK) { out.push([start, x - 4, prevSp]); start = x; prevK = k; prevSp = sp; }
}
out.push([start, 1246, prevSp]);
for (const [a, b, sp] of out)
  console.log(`x[${a},${b}] ` + sp.map(([s, e]) => `${s}-${e}`).join(" "));

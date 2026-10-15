// forest_17 平台穿透判定（flashbp17）：p4 终位 vs 地形 fixture 点内测试 + 关节平移 + 1000f 长跑
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const noInput = () => ({ fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });

const w = makeWorld("forest_17");
const lev = w.mechanisms.levers[4]; // l4 g1 -> p4
// 收集 ground fixtures 多边形（屏幕坐标）
const groundPolys = [];
let b = w.built.world.GetBodyList();
while (b) {
  if (b.GetUserData() === "ground") {
    let fx = b.GetFixtureList();
    while (fx) {
      const pts = fx.GetShape().m_vertices.slice(0, fx.GetShape().m_count).map((q) => ({ x: (b.GetPosition().x + q.x) * -32, y: (b.GetPosition().y + q.y) * -32 }));
      groundPolys.push(pts);
      fx = fx.GetNext();
    }
  }
  b = b.GetNext();
}
function inPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], k = poly[j];
    if ((a.y > pt.y) !== (k.y > pt.y) && pt.x < ((k.x - a.x) * (pt.y - a.y)) / (k.y - a.y) + a.x) c = !c;
  }
  return c;
}
function overlapCount(rect) {
  let n = 0;
  const samples = [
    { x: rect.x0 + 1, y: rect.y0 + 1 }, { x: rect.x1 - 1, y: rect.y0 + 1 },
    { x: rect.x0 + 1, y: rect.y1 - 1 }, { x: rect.x1 - 1, y: rect.y1 - 1 },
    { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 },
  ];
  for (const poly of groundPolys) for (const s of samples) if (inPoly(s, poly)) n++;
  return n;
}
const p4 = w.mechanisms.platforms[4];
const centerOf = (p) => ({ x: p.body.GetPosition().x * -32, y: p.body.GetPosition().y * -32 });
const c0 = centerOf(p4);
console.log(`p4 f0 center=(${c0.x.toFixed(1)},${c0.y.toFixed(1)}) overlapSamples=${overlapCount({ x0: c0.x - 48, x1: c0.x + 48, y0: c0.y - 14, y1: c0.y + 14 })}`);
const holdAngle = 0.3; // l4 gid24 onis=1 startPos=-1 → 杆角 +0.3 使 ja·onis<0 翻转
for (let f = 0; f < 1000; f++) {
  lev.body.SetAngle(holdAngle);
  lev.body.SetAngularVelocity(0);
  w.step(1 / 60, noInput());
}
const c1 = centerOf(p4);
console.log(`p4 @1000f center=(${c1.x.toFixed(1)},${c1.y.toFixed(1)}) overlapSamples=${overlapCount({ x0: c1.x - 48, x1: c1.x + 48, y0: c1.y - 14, y1: c1.y + 14 })}`);
console.log(`p4 jointTranslation=${p4.joint.GetJointTranslation().toFixed(3)}m limits=[${p4.joint.GetLowerLimit()},${p4.joint.GetUpperLimit()}]`);
console.log(`groundPolys=${groundPolys.length}`);
// 对照：p4 终位区域 (1023.7-1119.7, 257.9-286.1) 中心点逐多边形命名
const mid = { x: c1.x, y: c1.y };
groundPolys.forEach((poly, i) => {
  if (inPoly(mid, poly)) console.log(`  p4中心落入 poly#${i}: ${poly.map((q) => `(${q.x.toFixed(0)},${q.y.toFixed(0)})`).join(" ")}`);
});

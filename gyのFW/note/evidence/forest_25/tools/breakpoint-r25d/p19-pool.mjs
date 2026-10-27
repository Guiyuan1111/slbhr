// 水池区结构 x540-820 y270-460 + 液体 fixture
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const m2px = (v) => ({ x: -v.x * 32, y: -v.y * 32 });
console.log("liquids:", JSON.stringify(w.built.liquids?.map?.(l => ({ x: l.x, y: l.y, w: l.w, h: l.h, type: l.type })) ?? w.built.liquids).slice(0, 400));
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    const cnt = sh.m_count ?? 0, verts = sh.m_vertices;
    if (!verts || cnt < 2) continue;
    const vs = Array.from({ length: cnt }, (_, i) => m2px(verts[i]));
    const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 > 540 && x0 < 820 && y1 > 270 && y0 < 460) {
      console.log(`type=${b.GetType()} sens=${f.IsSensor()} ud=${JSON.stringify(f.GetUserData())} bbox(${Math.round(x0)},${Math.round(y0)})-(${Math.round(x1)},${Math.round(y1)}) ${vs.map(v=>`(${Math.round(v.x)},${Math.round(v.y)})`).join(" ")}`);
    }
  }
}

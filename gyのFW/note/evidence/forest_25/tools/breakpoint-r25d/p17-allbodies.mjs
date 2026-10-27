// 全 body 扫描：x950-1060 y180-300 区域所有 fixture（含 static）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_25");
const m2px = (v) => ({ x: -v.x * 32, y: -v.y * 32 });
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  const t = b.GetType();
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    const cnt = sh.m_count ?? 0, verts = sh.m_vertices;
    const isSensor = f.IsSensor();
    if (verts && cnt >= 2) {
      const vs = Array.from({ length: cnt }, (_, i) => m2px(b.GetWorldPoint ? (() => { const o = {}; try { return b.GetWorldPoint(verts[i], o); } catch { return verts[i]; } })() : verts[i]));
      const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x1 > 940 && x0 < 1070 && y1 > 170 && y0 < 310) {
        console.log(`body type=${t} sensor=${isSensor} userData=${JSON.stringify(f.GetUserData())} bbox(${Math.round(x0)},${Math.round(y0)})-(${Math.round(x1)},${Math.round(y1)}) ${vs.map(v=>`(${Math.round(v.x)},${Math.round(v.y)})`).join(" ")}`);
      }
    } else if (sh.m_radius) {
      const p = m2px(b.GetPosition());
      if (p.x > 940 && p.x < 1070 && p.y > 170 && p.y < 310) console.log(`body type=${t} CIRCLE at (${Math.round(p.x)},${Math.round(p.y)}) r=${(sh.m_radius*32).toFixed(1)}px`);
    }
  }
}

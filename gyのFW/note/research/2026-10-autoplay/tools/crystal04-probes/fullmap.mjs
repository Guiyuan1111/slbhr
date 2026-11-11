// fullmap.mjs — 全关 ASCII：16px 栅格，实心#、传感器O、致死~、冰I、门D
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("../../../data/crystal/levels/crystal_04");
const solid = [], marks = [];
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    const bp = b.GetPosition();
    const ud = f.GetUserData() ?? b.GetUserData() ?? {};
    const uds = String(ud.name ?? ud.type ?? "");
    let pts;
    if (sh.GetType() === 2) {
      pts = [];
      for (let i = 0; i < sh.m_count; i++) pts.push([-(bp.x + sh.m_vertices[i].x) * 32, -(bp.y + sh.m_vertices[i].y) * 32]);
    } else {
      const cx = -(bp.x + sh.m_p.x) * 32, cy = -(bp.y + sh.m_p.y) * 32, r = sh.m_radius * 32;
      pts = [[cx - r, cy - r], [cx + r, cy + r]];
    }
    // 栅格内近似：凸多边形逐单元中心点测试
    const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
    const y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    if (x1 < 0 || x0 > 1248 || y1 < 96 || y0 > 960) continue;
    const kind = f.IsSensor() ? (/liquid_death/.test(uds) ? "~" : /liquid/.test(uds) ? "L" : /door/.test(uds) ? "D" : "O")
      : /ice/.test(uds) ? "I" : "#";
    solid.push({ pts, x0, x1, y0, y1, kind });
  }
}
const CX = 16, CY = 16, X0 = 0, X1 = 1248, Y0 = 96, Y1 = 960;
const NCX = (X1 - X0) / CX, NCY = (Y1 - Y0) / CY;
const grid = Array.from({ length: NCY }, () => Array(NCX).fill("."));
const inPoly = (px, py, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
for (const s of solid)
  for (let cy = Math.max(0, Math.floor((s.y0 - Y0) / CY)); cy <= Math.min(NCY - 1, Math.floor((s.y1 - 1 - Y0) / CY)); cy++)
    for (let cx = Math.max(0, Math.floor((s.x0 - X0) / CX)); cx <= Math.min(NCX - 1, Math.floor((s.x1 - 1 - X0) / CX)); cx++) {
      const mx = X0 + cx * CX + CX / 2, my = Y0 + cy * CY + CY / 2;
      if (inPoly(mx, my, s.pts)) if (grid[cy][cx] === "." || s.kind !== "O") grid[cy][cx] = s.kind;
    }
// 传送门位置标 P
for (const p of w.mechs.portals ?? []) {
  const px = -p.body.GetPosition().x * 32, py = -p.body.GetPosition().y * 32;
  const cx = Math.floor((px - X0) / CX), cy = Math.floor((py - Y0) / CY);
  if (cx >= 0 && cx < NCX && cy >= 0 && cy < NCY) grid[cy][cx] = "P";
}
// 杆/推杆/平台
for (const l of w.mechs.levers ?? []) {
  const px = -l.body.GetPosition().x * 32, py = -l.body.GetPosition().y * 32;
  grid[Math.floor((py - Y0) / CY)]?.[Math.floor((px - X0) / CX)]?.len ?? 0;
  const cy = Math.floor((py - Y0) / CY), cx = Math.floor((px - X0) / CX);
  if (grid[cy]?.[cx] !== undefined) grid[cy][cx] = "V";
}
{
  const plat = w.mechs.platforms?.[0];
  if (plat) {
    const px = -plat.body.GetPosition().x * 32, py = -plat.body.GetPosition().y * 32;
    const cy = Math.floor((py - Y0) / CY), cx = Math.floor((px - X0) / CX);
    if (grid[cy]?.[cx] !== undefined) grid[cy][cx] = "M";
  }
}
let ruler = "     ";
for (let cx = 0; cx < NCX; cx++) ruler += cx % 5 === 0 ? String((X0 + cx * CX) / 100 % 10) : ".";
console.log("   x: 0" + ruler.slice(6) + "  (每字符16px，刻度=百位)");
for (let cy = 0; cy < NCY; cy++) {
  const y = Y0 + cy * CY;
  console.log(String(y).padStart(4) + " " + grid[cy].join(""));
}
console.log("P=portal V=lever M=platform I=ice ~=死液 L=液面 O=sensor D=door");

// eastfull.mjs — 东剖面全量 fixture dump：x[880,1248]×y[150,960] + x[500,900]×y[600,960]
//   （此前 pocketdump 窗口 y[420,700] 漏了上层梯台；本次彻底摸清出生板→底厅的全部竖向连通）
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const w = makeWorld("../../../data/crystal/levels/crystal_04");
const px = (v) => -v * 32;
const rows = [];
for (let b = w.built.world.GetBodyList(); b; b = b.GetNext()) {
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    const bp = b.GetPosition();
    const ud = f.GetUserData() ?? b.GetUserData() ?? {};
    const uds = String(ud.name ?? ud.type ?? ud.kind ?? "");
    let pts;
    if (sh.GetType() === 2) {
      pts = [];
      for (let i = 0; i < sh.m_count; i++) pts.push([px(bp.x + sh.m_vertices[i].x), px(bp.y + sh.m_vertices[i].y)]);
    } else {
      const cx = px(bp.x + sh.m_p.x), cy = px(bp.y + sh.m_p.y), r = sh.m_radius * 32;
      pts = [[cx - r, cy - r], [cx + r, cy + r]];
    }
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const zone = (x0 >= 880 && x1 <= 1250 && y0 >= 140 && y1 <= 970) || (x0 >= 495 && x1 <= 905 && y0 >= 590 && y1 <= 970);
    if (!zone) continue;
    const kind = f.IsSensor() ? (/death|kill/.test(uds) ? "DEATH-SENSOR" : /door/.test(uds) ? "door-sensor" : "sensor") : /acid|lava|water|liquid/.test(uds) ? "LIQUID" : "SOLID";
    rows.push(`${kind.padEnd(13)} [${x0.toFixed(1).padStart(6)},${x1.toFixed(1).padStart(7)}]×[${y0.toFixed(1).padStart(6)},${y1.toFixed(1).padStart(7)}] ${uds.slice(0, 40)}`);
  }
}
rows.sort();
console.log(rows.join("\n"));

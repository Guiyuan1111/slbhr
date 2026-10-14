// r25c 探针 11：转储与弹跳区相交的 ground fixture 顶点（屏幕坐标）
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const w = makeWorld("forest_25");
for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });

function* iterBodies(world) { let b = world.GetBodyList(); while (b) { yield b; b = b.GetNext(); } }
function* iterFix(body) { let fx = body.GetFixtureList(); while (fx) { yield fx; fx = fx.GetNext(); } }

const bx0 = -1250 / 32, bx1 = -985 / 32, by0 = -930 / 32, by1 = -750 / 32;
for (const b of iterBodies(w.built.world)) {
  const pos = b.GetPosition();
  if (b.GetUserData() !== "ground") continue;
  for (const fx of iterFix(b)) {
    const sh = fx.GetShape();
    if (!sh.m_vertices || !sh.m_vertices.length) continue;
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const v of sh.m_vertices) { mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y); }
    if (mxx + pos.x >= bx0 && mnx + pos.x <= bx1 && mxy + pos.y >= by0 && mny + pos.y <= by1) {
      const vs = sh.m_vertices.map((v) => `(${(-32 * (v.x + pos.x)).toFixed(0)},${(-32 * (v.y + pos.y)).toFixed(0)})`).join(" ");
      console.log(`verts(screen): ${vs}`);
    }
  }
}

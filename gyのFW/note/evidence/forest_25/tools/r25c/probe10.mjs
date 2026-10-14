// r25c 探针 10b：GetAABB 枚举弹跳区 (screen 940-1030, 590-710) 内所有 fixture
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";
const N = { up: false, left: false, right: false };
const w = makeWorld("forest_25");
for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });

function* iterBodies(world) { let b = world.GetBodyList(); while (b) { yield b; b = b.GetNext(); } }
function* iterFix(body) { let fx = body.GetFixtureList(); while (fx) { yield fx; fx = fx.GetNext(); } }

// 目标盒：screen x[940,1030] y[590,710] → b2 镜像 x[-1030/32,-940/32] y[-710/32,-590/32]
const bx0 = -1030 / 32, bx1 = -940 / 32, by0 = -710 / 32, by1 = -590 / 32;
console.log(`target b2 x[${bx0.toFixed(2)},${bx1.toFixed(2)}] y[${by0.toFixed(2)},${by1.toFixed(2)}]`);
let n = 0;
for (const b of iterBodies(w.built.world)) {
  const ud = b.GetUserData();
  const pos = b.GetPosition();
  for (const fx of iterFix(b)) {
    n++;
    const sh = fx.GetShape();
    let lo, hi;
    if (sh.m_vertices && sh.m_vertices.length) {
      let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
      for (const v of sh.m_vertices) { mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y); }
      lo = { x: mnx + pos.x, y: mny + pos.y }; hi = { x: mxx + pos.x, y: mxy + pos.y };
    } else if (sh.m_radius !== undefined) {
      const c = sh.m_p ? { x: sh.m_p.x + pos.x, y: sh.m_p.y + pos.y } : pos;
      lo = { x: c.x - sh.m_radius, y: c.y - sh.m_radius }; hi = { x: c.x + sh.m_radius, y: c.y + sh.m_radius };
    } else continue;
    if (hi.x >= bx0 && lo.x <= bx1 && hi.y >= by0 && lo.y <= by1) {
      const fud = fx.GetUserData ? fx.GetUserData() : fx.m_userData;
      console.log(`HIT ud=${JSON.stringify(ud)} fud=${JSON.stringify(fud)} pos=(${pos.x.toFixed(2)},${pos.y.toFixed(2)}) aabb x[${lo.x.toFixed(2)},${hi.x.toFixed(2)}] y[${lo.y.toFixed(2)},${hi.y.toFixed(2)}]  screen x[${(-hi.x * 32).toFixed(0)},${(-lo.x * 32).toFixed(0)}] y[${(-hi.y * 32).toFixed(0)},${(-lo.y * 32).toFixed(0)}]`);
    }
  }
}
console.log("total fixtures:", n);

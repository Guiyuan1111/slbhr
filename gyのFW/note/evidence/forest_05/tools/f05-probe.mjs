import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_05");
const N = { up:false,left:false,right:false };
for (let f = 0; f < 240; f++) {
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  if (f % 20 === 0) console.log(`f${f} fb(${a.x.toFixed(0)},${(a.y+35.2).toFixed(0)}) wg(${b.x.toFixed(0)},${(b.y+35.2).toFixed(0)}) ${a.dead||a.dying?'fb死':''}${b.dead||b.dying?'wg死':''}`);
  w.step(1/60, { fireboy: N, watergirl: N });
  if (a.dead||a.dying||b.dead||b.dying) { console.log("死", f); break; }
}
console.log("phase", w.phase);
// 液体?
const world = w.built?.world ?? w.world;
let bd = world.GetBodyList(), k=0;
while (bd) { if (String(bd.GetUserData()).match(/liquid|water|fire|lava/)) { k++; if (k<8) { let fx=bd.GetFixtureList(); while(fx){ const sh=fx.GetShape(); if (sh.m_vertices) console.log("liquid?", bd.GetUserData(), sh.m_vertices.slice(0,4).map(q=>`(${((bd.GetPosition().x+q.x)*-32).toFixed(0)},${((bd.GetPosition().y+q.y)*-32).toFixed(0)})`).join(" ")); fx=fx.GetNext(); } } } bd = bd.GetNext(); }
console.log("liquid bodies:", k);

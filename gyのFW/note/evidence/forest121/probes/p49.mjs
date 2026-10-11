import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_12_1");
const world = w.built.world;
const rows = [];
for (let b = world.GetBodyList(); b; b = b.GetNext()) {
  for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
    const sh = f.GetShape();
    if (sh.GetType() !== 2) continue;
    const pts = [];
    let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
    for (let i=0;i<sh.m_count;i++) {
      const x = -sh.m_vertices[i].x*32, y = -sh.m_vertices[i].y*32;
      pts.push(`(${x.toFixed(0)},${y.toFixed(0)})`);
      minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);
    }
    if (minx < 400 && miny < 930 && maxy > 440) rows.push({miny,minx,s:pts.join(" ")});
  }
}
rows.sort((a,b)=>a.miny-b.miny||a.minx-b.minx);
for (const r of rows) console.log(r.s);

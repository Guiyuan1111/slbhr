import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w0 = makeWorld("forest_12_1");
const built = w0["built"];
for (const l of (built.liquids ?? [])) console.log("LIQUID:", l.kind ?? l.type ?? l.role, "x", l.x ?? l.px, "y", l.y ?? l.py, "w", l.w, "h", l.h, Object.keys(l).join(","));
for (let i=0;i<(built.doors??[]).length;i++){ const d=(built.doors??[])[i]; console.log("DOOR:", i, Object.keys(d).join(",")); }
for (const x of [1050, 1060, 1070, 1080, 1090, 1100]) {
  const w = makeWorld("forest_12_1");
  const g = w.chars.watergirl.body;
  const Vec2 = g.GetPosition().constructor;
  g.SetTransformVecRadians(new Vec2(-x/32, -380/32), 0);
  w.step(1/60, { fireboy:{}, watergirl:{} }); w.step(1/60, { fireboy:{}, watergirl:{} });
  let last = "";
  for (let f=0; f<200; f++) {
    w.step(1/60, { fireboy:{}, watergirl:{} });
    const G = w.snapshotPlayer("watergirl");
    last = `drop${x}: f${f} (${G.x.toFixed(1)},${(G.y+35.2).toFixed(1)}) frac=${w.doors.watergirl.frac.toFixed(1)}${w.doors.watergirl.isUp?"^":""}`;
  }
  console.log(last);
}

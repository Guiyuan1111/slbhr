// r23b: batch vertical sections. usage: node TEMP/r23b/hmap.mjs <x1> <x2> <dx> <y1> <y2>
import { readFileSync } from "node:fs";
const bodies = JSON.parse(readFileSync(new URL("./fix.json", import.meta.url), "utf8"));
const SOLIDS = [];
for (const b of bodies) for (const f of b.fixtures) if (!f.sensor && Array.isArray(f.pts)) SOLIDS.push(f.pts);

function sectV(x, y1, y2) {
  const hits = [];
  for (const pts of SOLIDS) {
    const ys = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ax - x) * (bx - x) < 0) ys.push(ay + (by - ay) * ((x - ax) / (bx - ax)));
      else if (ax === x && bx === x) { ys.push(ay, by); }
      else if (ax === x) ys.push(ay);
      else if (bx === x) ys.push(by);
    }
    ys.sort((a, b) => a - b);
    for (let i = 0; i + 1 < ys.length; i += 2) {
      const lo = Math.max(ys[i], y1), hi = Math.min(ys[i + 1], y2);
      if (hi > lo) hits.push([Math.round(lo), Math.round(hi)]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  // merge
  const m = [];
  for (const h of hits) {
    if (m.length && h[0] <= m[m.length - 1][1] + 1) m[m.length - 1][1] = Math.max(m[m.length - 1][1], h[1]);
    else m.push(h);
  }
  return m;
}
const [x1, x2, dx, y1, y2] = process.argv.slice(2).map(Number);
for (let x = x1; x <= x2; x += dx) {
  const m = sectV(x, y1, y2);
  console.log(`x=${x}: ${m.map(r => `[${r[0]},${r[1]}]`).join(" ") || "OPEN"}`);
}

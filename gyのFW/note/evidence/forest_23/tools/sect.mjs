// r23b: section analyzer over fix.json.
// usage: node TEMP/r23b/sect.mjs v <x> <y1> <y2>   (solid intervals along vertical line x)
//        node TEMP/r23b/sect.mjs h <y> <x1> <x2>   (solid intervals along horizontal line y)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const bodies = JSON.parse(readFileSync(new URL("./fix.json", import.meta.url), "utf8"));
const SOLIDS = [];
for (const b of bodies) for (const f of b.fixtures) if (!f.sensor && Array.isArray(f.pts)) SOLIDS.push(f.pts);

function sectV(x, y1, y2) {
  const hits = [];
  for (const pts of SOLIDS) {
    const ys = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ax - x) * (bx - x) < 0 || (bx === x && ax === x)) {
        if (ax === bx) { ys.push(ay, by); continue; }
        ys.push(ay + (by - ay) * ((x - ax) / (bx - ax)));
      } else if (ax === x && bx !== x) ys.push(ay);
      else if (bx === x && ax !== x) ys.push(by);
    }
    ys.sort((a, b) => a - b);
    for (let i = 0; i + 1 < ys.length; i += 2) {
      const lo = Math.max(ys[i], y1), hi = Math.min(ys[i + 1], y2);
      if (hi > lo) hits.push([Math.round(lo * 10) / 10, Math.round(hi * 10) / 10]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  return hits;
}
function sectH(y, x1, x2) {
  const hits = [];
  for (const pts of SOLIDS) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay - y) * (by - y) < 0) xs.push(ax + (bx - ax) * ((y - ay) / (by - ay)));
      else if (ay === y && by === y) { xs.push(ax, bx); continue; }
      else if (ay === y) xs.push(ax);
      else if (by === y) xs.push(bx);
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const lo = Math.max(xs[i], x1), hi = Math.min(xs[i + 1], x2);
      if (hi > lo) hits.push([Math.round(lo * 10) / 10, Math.round(hi * 10) / 10]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  return hits;
}
const raw = process.argv.slice(2);
const mode = raw[0] === "v" ? 0 : raw[0] === "h" ? 1 : NaN;
const [cs, c1, c2] = raw.slice(1).map(Number);
const res = mode === 0 ? sectV(cs, c1, c2) : sectH(cs, c1, c2);
console.log(`${mode === 0 ? `x=${cs} y[${c1},${c2}]` : `y=${cs} x[${c1},${c2}]`}: ${res.map(r => `[${r[0]},${r[1]}]`).join(" ") || "NONE"}`);

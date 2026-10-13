// forest_20 剖面修正版：剔除 m_vertices 尾部 (0,0) padding 后重做点 containment
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs"));
const w = makeWorld("forest_20");
const out = [];
const P = (...a) => out.push(a.join(" "));

let fx = w.built.groundBody.GetFixtureList();
const polys = [];
while (fx) {
  const sh = fx.GetShape();
  if (sh && sh.m_vertices) {
    let vs = sh.m_vertices.map((q) => [((w.built.groundBody.GetPosition().x + q.x) * -32), ((w.built.groundBody.GetPosition().y + q.y) * -32)]);
    while (vs.length && vs[vs.length - 1][0] === 0 && vs[vs.length - 1][1] === 0) vs.pop();
    polys.push(vs);
  }
  fx = fx.GetNext();
}
const inPoly = (x, y, vs) => { let ins = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { const [xi, yi] = vs[i], [xj, yj] = vs[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const solidAt = (x, y) => polys.some((vs) => inPoly(x, y, vs));
const spans = (fixed, lo, hi, vert) => {
  const res = []; let st = null;
  for (let v = lo; v <= hi; v += 4) {
    const s = vert ? solidAt(fixed, v) : solidAt(v, fixed);
    if (s && st === null) st = v;
    if (!s && st !== null) { res.push([st, v - 4]); st = null; }
  }
  if (st !== null) res.push([st, hi]);
  return res;
};
P("== vertical profiles FIXED (x: solid y-spans step4)");
for (let c = 0; c < 39; c++) {
  const x = 16 + 32 * c;
  P(`x=${x}: ` + spans(x, 0, 928, true).map((s) => `${s[0]}-${s[1]}`).join(","));
}
P("== wind column vs ground samples FIXED:");
for (const [qx, qy] of [[655, 480], [655, 400], [655, 300], [655, 224], [655, 200], [620, 200], [690, 200], [655, 130], [655, 120]]) {
  P(`   (${qx},${qy}) solid=${solidAt(qx, qy)}`);
}
console.log(out.join("\n"));

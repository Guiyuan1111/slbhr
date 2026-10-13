// forest_20 解码：LevelData 全量 + ground fixture 逐个 dump + 网格 ASCII + 剖面 + f0 状态 + 出生探针
// 运行: node --import tsx TEMP/flashbp20/geo-f20.mjs   (CWD 任意, 内部绝对路径)
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs"));

const w = makeWorld("forest_20");
const lv = w.level;
const out = [];
const P = (...a) => out.push(a.join(" "));

P("== meta", lv.cols, "x", lv.rows, "tile", lv.tile, "= px", lv.widthPx, "x", lv.heightPx);
P("== spawn fb", JSON.stringify(lv.spawn.fireboy), " wg", JSON.stringify(lv.spawn.watergirl));
P("== doors", JSON.stringify(lv.doors.fireboy), JSON.stringify(lv.doors.watergirl));
P("== diamonds", lv.diamonds.map((d) => `${d.id}:${d.kind}@(${d.x},${d.y})`).join(" ") || "(none)");
P("== liquidRuns", JSON.stringify(lv.liquidRuns));
P("== levers", lv.levers.map((l) => `${l.id} g${l.group} onis${l.onis} start${l.startPos} @(${l.x},${l.y})`).join(" | "));
P("== pushers", lv.pushers.map((p) => `${p.id} g${p.group} @(${p.x},${p.y})`).join(" | "));
P("== platforms", lv.platforms.map((p) => `${p.id} g${p.group} rect(${p.x},${p.y} ${p.w}x${p.h}) d(${p.dx},${p.dy}) rot${p.rotation}`).join(" | "));
P("== balls", lv.balls.map((b) => `${b.id} @(${b.x},${b.y})`).join(" | "));
P("== winds", lv.winds.map((f) => `${f.id} g${f.group} rect(${f.rect.x},${f.rect.y} ${f.rect.w}x${f.rect.h}) rot${f.rotation} len${f.lengthM} ini${f.initialState}`).join(" | "));
P("== unknown", JSON.stringify(lv.unknown));

// ---- f0 机关状态
const M = w.mechanisms;
P("== f0 lever states", M.levers.map((l) => l.state).join(","), "| wind", M.winds.map((f) => f.state).join(","), "| platform", M.platforms.map((p) => p.state).join(","));
for (const f of M.winds) {
  const bp = f.body.GetPosition();
  const a = f.body.GetAngle();
  P(`== wind body screen (${(bp.x * -32).toFixed(2)},${(bp.y * -32).toFixed(2)}) angleDeg ${(a * 180 / Math.PI).toFixed(3)}`);
  const cs = Math.cos(a), sn = Math.sin(a);
  const L = (lx, ly) => [((bp.x + lx * cs - ly * sn) * -32), ((bp.y + lx * sn + ly * cs) * -32)];
  P("   wind column quad (screen):", [L(-1.3, 0.5), L(1.3, 0.5), L(1.3, 12.5), L(-1.3, 12.5)].map((p) => `(${p[0].toFixed(1)},${p[1].toFixed(1)})`).join(" "));
}
// 平台体初始中心/fixture(屏)
M.platforms.forEach((p, i) => {
  const bp = p.body.GetPosition();
  P(`   plat p${i} bodyScreen (${(bp.x * -32).toFixed(1)},${(bp.y * -32).toFixed(1)})`);
});

// ---- ground fixtures（全在单一 groundBody, pos 0,0）
let fx = w.built.groundBody.GetFixtureList();
const polys = [];
let gi = 0;
while (fx) {
  const sh = fx.GetShape();
  if (sh && sh.m_vertices) {
    const vs = sh.m_vertices.map((q) => [+((w.built.groundBody.GetPosition().x + q.x) * -32).toFixed(2), +((w.built.groundBody.GetPosition().y + q.y) * -32).toFixed(2)]);
    polys.push(vs);
    P(`g${gi} ` + vs.map((p) => `(${p[0]},${p[1]})`).join(" "));
  }
  fx = fx.GetNext();
  gi++;
}
P("== ground fixture count", polys.length);

// ---- 网格 ASCII（. 空 #实心 a=SLA b=SLB c=WC d=WD W水 L岩 G绿 ?其它）
for (let r = 0; r < lv.rows; r++) {
  let s = "";
  for (let c = 0; c < lv.cols; c++) {
    const t = lv.groundType[r * lv.cols + c];
    s += t === -99 ? "." : t === 0 ? "#" : t === 1 ? "a" : t === 2 ? "b" : t === 3 ? "c" : t === 4 ? "d" : t === 5 ? "W" : t === 6 ? "L" : t === 7 ? "G" : "?";
  }
  P(`row${String(r).padStart(2)} ${s}`);
}

// ---- 剖面：点在多边形（射线法），竖直剖面 x=16+32c；水平剖面 y=16+32r
function inPoly(x, y, vs) {
  let ins = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
const solidAt = (x, y) => polys.some((vs) => inPoly(x, y, vs));
const spans = (fixed, lo, hi, vert) => {
  const res = [];
  let st = null;
  for (let v = lo; v <= hi; v += 4) {
    const s = vert ? solidAt(fixed, v) : solidAt(v, fixed);
    if (s && st === null) st = v;
    if (!s && st !== null) { res.push([st, v - 4]); st = null; }
  }
  if (st !== null) res.push([st, hi]);
  return res;
};
P("== vertical profiles (x: solid y-spans, step4)");
for (let c = 0; c < lv.cols; c++) {
  const x = 16 + 32 * c;
  P(`x=${x}: ` + spans(x, 0, 928, true).map((s) => `${s[0]}-${s[1]}`).join(","));
}
P("== horizontal profiles (y: solid x-spans, step4)");
for (let r = 0; r < lv.rows; r++) {
  const y = 16 + 32 * r;
  P(`y=${y}: ` + spans(y, 0, 1248, false).map((s) => `${s[0]}-${s[1]}`).join(","));
}

// ---- 出生探针：240f 无输入
let evs = [];
for (let f = 0; f < 240; f++) evs = evs.concat(w.step(1 / 60, { fireboy: {}, watergirl: {} }));
const pf = w.snapshotPlayer("fireboy"), pw = w.snapshotPlayer("watergirl");
P(`== probe240 phase=${w.phase} fb=(${pf.x.toFixed(1)},${pf.y.toFixed(1)}) vx=${pf.vx.toFixed(2)} wg=(${pw.x.toFixed(1)},${pw.y.toFixed(1)}) vx=${pw.vx.toFixed(2)}`);
P("== probe events", evs.length ? JSON.stringify(evs.slice(0, 5)) : "(none)");

console.log(out.join("\n"));

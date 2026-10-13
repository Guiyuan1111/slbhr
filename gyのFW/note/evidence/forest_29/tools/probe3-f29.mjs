// forest_29 滑轮终态探针：箱移走 → wg 上板2 → 板2 沉到 c17 柱顶 / 板1 升；箱东推落点对照
// 用法：cd TEMP/flashbp29 && node --import tsx probe3-f29.mjs
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const sx = (b) => +(b.GetPosition().x * -32).toFixed(2);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(2);
const inp = { fireboy: {}, watergirl: {} };
const teleport = (w, role, x, y) => {
  const b = w.chars[role].body;
  const Vec2 = b.GetPosition().constructor;
  b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(new Vec2(0, 0));
  b.SetAwake(true);
};
const rectOf = (body) => {
  let fx = body.GetFixtureList(); const pts = [];
  while (fx) { if (fx.GetShape().m_vertices) for (const q of fx.GetShape().m_vertices.slice(0, 4)) { const c = Math.cos(body.GetAngle()), s = Math.sin(body.GetAngle()); pts.push([+((body.GetPosition().x + c * q.x - s * q.y) * -32).toFixed(1), +((body.GetPosition().y + s * q.x + c * q.y) * -32).toFixed(1)]); } fx = fx.GetNext(); }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return `x[${Math.min(...xs)},${Math.max(...xs)}] y[${Math.min(...ys)},${Math.max(...ys)}]`;
};

// F4: 120f 沉降 → 箱向左推 400f（+60 b2x = 屏幕向左）→ wg 上板2 (560,660) → 480f 终态
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  const box = M.props[0].body, Vec2 = box.GetPosition().constructor;
  for (let f = 0; f <= 400; f++) { box.ApplyForce(new Vec2(60, 0), box.GetPosition()); w.step(1 / 60, inp); }
  console.log(`[F4] 箱移走后: box=(${sx(box)},${sy(box)}) plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`);
  teleport(w, "watergirl", 560, 660);
  const traj = [];
  for (let f = 0; f <= 480; f++) {
    w.step(1 / 60, inp);
    if (f % 80 === 0 || f === 480) { const p = w.snapshotPlayer("watergirl"); traj.push(`f${f}: wg=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  traj.push(`终态 rect: plat1 ${rectOf(M.pulleys[0].plat1)} | plat2 ${rectOf(M.pulleys[0].plat2)}`);
  console.log("[F4] wg 上板2(箱已移走):\n  " + traj.join("\n  "));
}

// F5: 对照——箱向东推（-60 b2x = 屏幕向右）落点
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  const box = M.props[0].body, Vec2 = box.GetPosition().constructor;
  const traj = [];
  for (let f = 0; f <= 400; f++) {
    box.ApplyForce(new Vec2(-60, 0), box.GetPosition());
    w.step(1 / 60, inp);
    if (f % 100 === 0 || f === 400) traj.push(`f${f}: box=(${sx(box)},${sy(box)}) angle deg=${(box.GetAngle()*180/Math.PI).toFixed(1)} plat1=${sy(M.pulleys[0].plat1)} plat2=${sy(M.pulleys[0].plat2)}`);
  }
  console.log("[F5] 箱向右(东)推:\n  " + traj.join("\n  "));
}
console.log("done");

// forest_18 机关探针：f0 空转 240f（出生稳定+机关初态）→ 拉杆/推块驱动 → 平台响应
import { makeWorld } from "../../../../scripts/e2e/routetool/kernel.mjs";
import { b2 } from "../../../../packages/shared/src/kernel/b2.ts";

const B = b2();
const v = (x, y) => new B.b2Vec2(x, y);
const DT = 1 / 60;
const snap = (w, tag) => {
  const m = w.mechSnapshot();
  const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
  console.log(`-- ${tag}`);
  console.log("  levers:", m.levers.map(l => `l${l.id}(g${l.group},st${l.state},${(l.angle * 180 / Math.PI).toFixed(1)}deg)`).join(" "));
  console.log("  pushers:", m.pushers.map(p => `b${p.id}(g${p.group},st${p.state},${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(" "));
  console.log("  platforms:", m.platforms.map(p => `p${p.id}(st${p.state},${p.x.toFixed(0)},${p.y.toFixed(0)},${(p.angle * 180 / Math.PI).toFixed(1)}deg)`).join(" "));
  console.log(`  players: fb(${fb.x.toFixed(1)},${fb.y.toFixed(1)},dead=${fb.dead}) wg(${wg.x.toFixed(1)},${wg.y.toFixed(1)},dead=${wg.dead})`);
};

// ---- Phase A: f0 空转 240f
{
  const w = makeWorld("forest_18");
  snap(w, "f0 (构造后未步进)");
  for (let f = 1; f <= 240; f++) w.step(DT, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
  snap(w, "f240 (空转后)");
  if (f240dead(w)) console.log("  !! 空转期死亡");
}
function f240dead(w) {
  return w.snapshotPlayer("fireboy").dead || w.snapshotPlayer("watergirl").dead;
}

// ---- Phase B: 拉杆 l1 (g2) 正向扳 → p4 旋转观察 120f → 反向回扳
{
  console.log("\n== Phase B: 拉杆 l1 (group2) 驱动 p4");
  const w = makeWorld("forest_18");
  const lev = w.mechanisms.levers[1];
  for (let f = 1; f <= 5; f++) w.step(DT, idle());
  console.log("  杆初始 bodyAngle:", (lev.body.GetAngle() * 180 / Math.PI).toFixed(1), "deg; 施加正角速度(物理CCW)");
  for (let f = 0; f < 40; f++) { lev.body.SetAngularVelocity(3.0); w.step(DT, idle()); }
  lev.body.SetAngularVelocity(0);
  let last = 0;
  for (const f of [1, 15, 30, 60, 120]) {
    for (let i = 0; i < f - last; i++) w.step(DT, idle());
    last = f;
    snap(w, `扳杆后 +${f}f`);
  }
  console.log("  -- 反向回扳 (负角速度 40f)");
  for (let f = 0; f < 40; f++) { lev.body.SetAngularVelocity(-3.0); w.step(DT, idle()); }
  lev.body.SetAngularVelocity(0);
  for (let f = 0; f < 60; f++) w.step(DT, idle());
  snap(w, "回扳 60f 后");
}

// ---- Phase C: 推块 b0 (group3) 压板 → p2 观察
{
  console.log("\n== Phase C: 推块 b0 (group3, 880,704) 压板 → p2");
  const w = makeWorld("forest_18");
  const fb = w.players.fireboy;
  fb.body.SetPosition(v(-880 / 32, -660 / 32)); // 屏幕点 (880,660) 压板上方
  fb.body.SetLinearVelocity(v(0, 0));
  for (const f of [20, 60, 120]) {
    for (let i = 0; i < f - (w._n || 0); i++) w.step(DT, idle());
    w._n = f;
    snap(w, `压板 +${f}f`);
  }
  fb.body.SetPosition(v(-576 / 32, -400 / 32)); // 回出生
  fb.body.SetLinearVelocity(v(0, 0));
  for (let f = 0; f < 120; f++) w.step(DT, idle());
  snap(w, "离开后 +120f");
}

// ---- Phase D: 推块 b1 (group8) 压板 → p3 观察
{
  console.log("\n== Phase D: 推块 b1 (group8, 64,96) 压板 → p3");
  const w = makeWorld("forest_18");
  const wg = w.players.watergirl;
  wg.body.SetPosition(v(-64 / 32, -52 / 32)); // 屏幕点 (64,52) 压板上方
  wg.body.SetLinearVelocity(v(0, 0));
  for (const f of [20, 60, 120]) {
    for (let i = 0; i < f - (w._n2 || 0); i++) w.step(DT, idle());
    w._n2 = f;
    snap(w, `压板 +${f}f`);
  }
}
function idle() { return { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } }; }

// probe3: 传送位移矩阵 + 液体致死正确姿势复测（feet 圆在体心下方 28.8px！）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const inp = { fireboy: {}, watergirl: {} };
const teleport = (w, role, x, y) => {
  const b = w.chars[role].body;
  const Vec2 = b.GetPosition().constructor;
  b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(new Vec2(0, 0));
  b.SetAwake(true);
};

// M1: 多点传送首步位移
for (const [x, y] of [[576, 300], [200, 250], [700, 300], [384, 208], [384, 300], [576, 860]]) {
  const w = makeWorld("forest_30");
  teleport(w, "fireboy", x, y);
  const p0 = w.chars.fireboy.body.GetPosition();
  w.step(1 / 60, inp);
  const p1 = w.chars.fireboy.body.GetPosition();
  console.log(`[M1] fb (${x},${y}) -> step1 (${(p1.x * -32).toFixed(2)},${(p1.y * -32).toFixed(2)})  delta=(${((p1.x - p0.x) * -32).toFixed(2)},${((p1.y - p0.y) * -32).toFixed(2)})`);
}

// M2: box 传送对照
{
  const w = makeWorld("forest_30");
  const box = w.mechanisms.props[2].body;
  const Vec2 = box.GetPosition().constructor;
  box.SetTransformVecRadians(new Vec2(-384 / 32, -208 / 32), 0);
  box.SetLinearVelocity(new Vec2(0, 0)); box.SetAwake(true);
  const p0 = box.GetPosition();
  w.step(1 / 60, inp);
  const p1 = box.GetPosition();
  console.log(`[M2] box (512,864)->(384,208) step1 (${(p1.x * -32).toFixed(2)},${(p1.y * -32).toFixed(2)}) delta=(${((p1.x - p0.x) * -32).toFixed(2)},${((p1.y - p0.y) * -32).toFixed(2)})`);
}

// M3: 液体致死复测——feet 圆心=体心+28.8px，把体心传到液面上方使 feet 落入膜内：
// W1 膜 y[197.8,224] → feet 圆(中心+28.8±6.4)入膜需体心 y ∈ [163.4, 189.6]，选 180（膜上方悬停入膜）
for (const [label, role, x, y] of [
  ["M3a W1 fb", "fireboy", 384, 180],
  ["M3b W1 wg", "watergirl", 384, 180],
  ["M3c L1 wg", "watergirl", 928, 180],
  ["M3d L1 fb", "fireboy", 928, 180],
  ["M3e W3 fb", "fireboy", 928, 724],
  ["M3f W3 wg", "watergirl", 928, 724],
]) {
  const w = makeWorld("forest_30");
  teleport(w, role, x, y);
  const traj = [];
  for (let f = 0; f <= 120; f++) {
    w.step(1 / 60, inp);
    const p = w.snapshotPlayer(role);
    if (f <= 2 || p.dead || f % 40 === 0) traj.push(`f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} inLiq=${p.inLiquid}`);
    if (p.dead) { traj.push(`f${f}: DEAD`); break; }
  }
  console.log(`[${label}] @(${x},${y}):\n  ` + traj.join("\n  "));
}

// M4: 双人同池不同结果对照（W3: fb 应死 wg 活）
{
  const w = makeWorld("forest_30");
  teleport(w, "fireboy", 928, 724);
  teleport(w, "watergirl", 928, 724);
  for (let f = 0; f <= 150; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 150) {
      const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
      console.log(`[M4] f${f}: fb dead=${a.dead} @${a.y.toFixed(1)} | wg dead=${b.dead} @${b.y.toFixed(1)} inLiq fb=${a.inLiquid} wg=${b.inLiquid} phase=${w.phase}`);
    }
  }
}
console.log("done");

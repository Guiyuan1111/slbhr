// probe4: 真实交互链核验
// A W2 fb死/wg蹚+浮站拾d2；B/C 角色站推块→p0/p1 旋转（真实信号链）；
// D 双门开门/win；E 箱x0东推落点；F p2-ON 地面闸口 32px 缝通行
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const inp = { fireboy: {}, watergirl: {} };
const sx = (b) => +(b.GetPosition().x * -32).toFixed(2);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(2);
const teleport = (w, role, x, y) => {
  const b = w.chars[role].body;
  const Vec2 = b.GetPosition().constructor;
  b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(new Vec2(0, 0));
  b.SetAwake(true);
};

// A1: fb 从 W2 上方坠落（feet 入膜）
{
  const w = makeWorld("forest_30");
  teleport(w, "fireboy", 112, 300);
  for (let f = 0; f <= 100; f++) {
    w.step(1 / 60, inp);
    const p = w.snapshotPlayer("fireboy");
    if (f % 20 === 0 || p.dead) { console.log(`[A1] fb drop W2 f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} inLiq=${p.inLiquid}`); }
    if (p.dead) break;
  }
}
// A2: wg 落 W2 浮站 + 是否顺带拾取 d2(112,320)
{
  const w = makeWorld("forest_30");
  teleport(w, "watergirl", 112, 300);
  let evs = [];
  for (let f = 0; f <= 150; f++) {
    evs = evs.concat(w.step(1 / 60, inp));
    const p = w.snapshotPlayer("watergirl");
    if (f % 30 === 0 || f === 150) { console.log(`[A2] wg W2 f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} inLiq=${p.inLiquid} collected=${JSON.stringify(w.diamonds.map(d => d.collected))} ev=${JSON.stringify(evs.filter(e => e.type === "diamond"))}`); evs = []; }
  }
}

// B: fb 站上推块 b0(480,416 顶396.8) → g0 ON → p0 旋转
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  teleport(w, "fireboy", 480, 356);
  for (let f = 0; f <= 400; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 400) {
      const p = w.snapshotPlayer("fireboy");
      console.log(`[B] f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) b0.st=${M.pushers[0].state}/t=${M.pushers[0].joint.GetJointTranslation().toFixed(3)} p0 ja=${(M.platforms[0].joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)} @(${sx(M.platforms[0].body)},${sy(M.platforms[0].body)})`);
    }
  }
}
// C: fb 站上推块 b1(592,480 顶460.8) → g1 ON → p1 旋转
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  teleport(w, "fireboy", 592, 420);
  for (let f = 0; f <= 400; f++) {
    w.step(1 / 60, inp);
    if (f % 100 === 0 || f === 400) {
      const p = w.snapshotPlayer("fireboy");
      console.log(`[C] f${f}: fb=(${p.x.toFixed(1)},${p.y.toFixed(1)}) b1.st=${M.pushers[1].state} p1 ja=${(M.platforms[1].joint.GetJointAngleRadians()*180/Math.PI).toFixed(1)} @(${sx(M.platforms[1].body)},${sy(M.platforms[1].body)})`);
    }
  }
}

// D: 双门开门与 win
{
  const w = makeWorld("forest_30");
  teleport(w, "fireboy", 80, 700);
  teleport(w, "watergirl", 208, 604);
  for (let f = 0; f <= 200; f++) {
    const evs = w.step(1 / 60, inp);
    if (f % 40 === 0 || f === 200 || w.phase !== "playing") {
      const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
      console.log(`[D] f${f}: fb door=${fb.atDoor}/${fb.doorFrame} wg door=${wg.atDoor}/${wg.doorFrame} phase=${w.phase} ev=${JSON.stringify(evs.filter(e => e.type !== "mech"))}`);
    }
    if (w.phase !== "playing") break;
  }
}

// E: 箱 x0 (1064,416 落 r14 块顶448) 东推——施屏幕向右力，看落点（p0-ON 架板 vs 落 r18 大块顶576）
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  const box = M.props[0].body, Vec2 = box.GetPosition().constructor;
  const traj = [];
  for (let f = 0; f <= 400; f++) {
    box.ApplyForce(new Vec2(60, 0), box.GetPosition()); // physics +x = 屏幕西?? b2x=-x/32: physics +x → 屏幕 -32x → 西
    w.step(1 / 60, inp);
    if (f % 100 === 0 || f === 400) traj.push(`f${f}: box=(${sx(box)},${sy(box)})`);
  }
  console.log("[E] 箱x0 physics(+60,0)(=屏幕西)推:\n  " + traj.join("\n  "));
}
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  const box = M.props[0].body, Vec2 = box.GetPosition().constructor;
  const traj = [];
  for (let f = 0; f <= 400; f++) {
    box.ApplyForce(new Vec2(-60, 0), box.GetPosition()); // physics -x = 屏幕东
    w.step(1 / 60, inp);
    if (f % 100 === 0 || f === 400) traj.push(`f${f}: box=(${sx(box)},${sy(box)})`);
  }
  console.log("[E] 箱x0 physics(-60,0)(=屏幕东)推:\n  " + traj.join("\n  "));
}

// F: p2-ON 后地面闸口 x352-384（32px 缝）通行试验：l0 扳 ON → fb 传送 (368,860) 站缝中
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  const l0 = M.levers[0];
  for (let f = 0; f <= 200 && l0.state === 0; f++) { l0.body.ApplyTorque(30, true); w.step(1 / 60, inp); }
  for (let f = 0; f < 200; f++) w.step(1 / 60, inp);
  console.log(`[F] p2 ON 后 rect: plat=(${sx(M.platforms[2].body)},${sy(M.platforms[2].body)})`);
  teleport(w, "fireboy", 368, 860);
  for (let f = 0; f <= 150; f++) {
    w.step(1 / 60, inp);
    if (f % 50 === 0 || f === 150) { const p = w.snapshotPlayer("fireboy"); console.log(`[F] fb@(368,860) f${f}: (${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead}`); }
  }
}
console.log("done");

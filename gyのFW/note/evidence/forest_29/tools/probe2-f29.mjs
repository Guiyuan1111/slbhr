// forest_29 补充探针：平台零质量核验 + 滑轮质量 + F2 重跑（wg 正确落板2）
// 用法：cd TEMP/flashbp29 && node --import tsx probe2-f29.mjs
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

{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  console.log(`[M] masses: plat_id7=${M.platforms[0].body.GetMass().toFixed(4)} plat_id10=${M.platforms[2].body.GetMass().toFixed(4)} pulley_plat1=${M.pulleys[0].plat1.GetMass().toFixed(4)} pulley_plat2=${M.pulleys[0].plat2.GetMass().toFixed(4)} box=${M.props[0].body.GetMass().toFixed(4)} ball=${M.props[1].body.GetMass().toFixed(4)} fb=${w.chars.fireboy.body.GetMass().toFixed(4)} wg=${w.chars.watergirl.body.GetMass().toFixed(4)} lever=${M.levers[0].body.GetMass().toFixed(4)} pusher_g5=${M.pushers[0].body.GetMass().toFixed(4)}`);
}

// F2 重跑：120f 沉降后 wg 落板2 正上方 (560,660)（板2 f0 顶 704.8，传输中心 660 → 体底 688.8 悬于板上方）
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  for (let f = 0; f < 120; f++) w.step(1 / 60, inp);
  console.log(`[F2r] 落板前: plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`);
  teleport(w, "watergirl", 560, 660);
  const traj = [];
  for (let f = 0; f <= 360; f++) {
    w.step(1 / 60, inp);
    if (f % 60 === 0 || f === 360) { const p = w.snapshotPlayer("watergirl"); traj.push(`f${f}: wg=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`); }
  }
  console.log("[F2r] wg 落板2(560,660):\n  " + traj.join("\n  "));
  // 她再跳离（向右施力模拟走离）后板是否回平衡
  const b = w.chars.watergirl.body, Vec2 = b.GetPosition().constructor;
  for (let f = 0; f <= 120; f++) { b.ApplyForce(new Vec2(-40, 0), b.GetPosition()); w.step(1 / 60, inp); }
  const p = w.snapshotPlayer("watergirl");
  console.log(`[F2r] wg 左推离板 120f 后: wg=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${p.dead} plat1=(${sx(M.pulleys[0].plat1)},${sy(M.pulleys[0].plat1)}) plat2=(${sx(M.pulleys[0].plat2)},${sy(M.pulleys[0].plat2)})`);
}

// 平台幽灵穿透复核：id14 ON 状态下压 240f（已穿过实体 c4 柱），期间查询 id14 与 ground 的接触数
{
  const w = makeWorld("forest_29");
  const M = w.mechanisms;
  const b13 = M.pushers[1], p14 = M.platforms[3];
  const Vec2 = b13.body.GetPosition().constructor;
  let maxContacts = 0, sample = "";
  for (let f = 0; f <= 240; f++) {
    b13.body.ApplyForce(new Vec2(0, -60), b13.body.GetPosition());
    w.step(1 / 60, inp);
    // 数 id14 参与的接触
    let c = w.built.world.GetContactList(), n = 0;
    while (c) {
      const fa = c.GetFixtureA(), fb2 = c.GetFixtureB();
      if ((fa.GetBody() === p14.body || fb2.GetBody() === p14.body) && c.IsTouching()) n++;
      c = c.GetNext();
    }
    if (n > maxContacts) maxContacts = n;
    if (f === 120) sample = `f120: p14=(${sx(p14.body)},${sy(p14.body)}) touching=${n}`;
  }
  console.log(`[Ghost] id14 下行穿 c4 柱期间与任何体 IsTouching 接触数峰值=${maxContacts}；${sample}`);
  console.log(`[Ghost] 期望：质量 0 → 无碰撞响应；若峰值 0 即接触未生成/无冲量`);
}
console.log("done");

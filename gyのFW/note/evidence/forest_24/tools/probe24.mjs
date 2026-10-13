// flashbp24 探针: forest_24 headless——g3 推块→平台行程 / 滑轮双板动力学 / 罗马杆平衡 / 箱子参数
// 运行位置: TEMP/flashbp24/（相对路径 ../../scripts = gyのFW 根）；非游玩输入，仅机构实测
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const stepN = (w, n) => { for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} }); };
const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
const fmt = (b) => `(${sx(b)},${sy(b)})`;

// ---- A. f0 沉降：全员/箱/滑轮/罗马 240f ----
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  console.log("[A] f0+240f 沉降");
  const fb = w.players.fireboy, wg = w.players.watergirl;
  console.log(`  fb=${fmt(fb.body)} mass=${fb.body.GetMass().toFixed(3)}  wg=${fmt(wg.body)} mass=${wg.body.GetMass().toFixed(3)}`);
  console.log(`  box=${fmt(M.props[0].body)}  pusher=${fmt(M.pushers[0].body)} t=${M.pushers[0].joint.GetJointTranslation().toFixed(3)} state=${M.pushers[0].state}`);
  console.log(`  platform=${fmt(M.platforms[0].body)} state=${M.platforms[0].state}`);
  console.log(`  pulley p1=${fmt(M.pulleys[0].plat1)} p2=${fmt(M.pulleys[0].plat2)}`);
  for (const [i, r] of M.romans.entries()) {
    console.log(`  roman r${i} bar=${fmt(r.bar)} angle=${(r.bar.GetAngle() * 180 / Math.PI).toFixed(2)}deg base=${fmt(r.base)}`);
    // bar 两端世界坐标（GetWorldPoint 屏幕系换算）
    const B = w.B;
    const e = (lx, ly) => { const p = r.bar.GetWorldPoint(new B.b2Vec2(lx, ly), new B.b2Vec2()); return `(${(p.x * -32).toFixed(0)},${(p.y * -32).toFixed(0)})`; };
    console.log(`    bar r${i} 端点 screen: L端顶${e(-5.25, -0.3)} R端顶${e(5.25, -0.3)}（local b2 系，负x=屏幕右）`);
  }
}

// ---- B. g3 推块按压 → 平台行程（力 (0,-200)=屏幕向下，300f 按压 + 240f 回弹）----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const b0 = M.pushers[0], plat = M.platforms[0];
  console.log("\n[B] g3 按压实验: 压 pusher(1152,512) 300N? 施力 b2(0,-200) 300f");
  const traj = [];
  for (let f = 0; f <= 300; f++) {
    b0.body.ApplyForce(new w.B.b2Vec2(0, -200), b0.body.GetWorldCenter());
    if (f % 50 === 0) traj.push(`f${f}: t=${b0.joint.GetJointTranslation().toFixed(3)} st=${b0.state} plat=${fmt(plat.body)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("  ON:\n  " + traj.join("\n  "));
  traj.length = 0;
  for (let f = 0; f <= 240; f++) {
    if (f % 60 === 0) traj.push(`f${f}: t=${b0.joint.GetJointTranslation().toFixed(3)} st=${b0.state} plat=${fmt(plat.body)}`);
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
  }
  console.log("  OFF(释放):\n  " + traj.join("\n  "));
}

// ---- C. 平台手动注 state=1（绕过推块，验证平台自身行程是否被地形卡死）----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const plat = M.platforms[0];
  plat.state = 1;
  plat.signalApply();
  console.log("\n[C] 平台手动 state=1 + signalApply（验证行程限位）:");
  for (let f = 0; f <= 240; f += 40) {
    console.log(`  f${f}: plat=${fmt(plat.body)} state=${plat.state}`);
    stepN(w, 40);
  }
  console.log(`  末态: plat=${fmt(plat.body)}`);
}

// ---- D. 滑轮动力学：fb 传送到 board1 顶 (400,640)，观察双板互换 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  fb.body.SetPosition(new w.B.b2Vec2(-400 / 32, -640 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  console.log("\n[D] 滑轮: fb 传落到 board1(400,668顶) 上，双板动力学:");
  for (let f = 0; f <= 600; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 100 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} p1=${fmt(M.pulleys[0].plat1)} p2=${fmt(M.pulleys[0].plat2)}`);
  }
}

// ---- E. 滑轮反向：新世界，fb 传落到 board2(528,856)（板顶884）上 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  fb.body.SetPosition(new w.B.b2Vec2(-528 / 32, -856 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  console.log("\n[E] 滑轮: fb 落 board2(528,884顶) 上:");
  for (let f = 0; f <= 600; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 100 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} p1=${fmt(M.pulleys[0].plat1)} p2=${fmt(M.pulleys[0].plat2)}`);
  }
}

// ---- F. 罗马杆 r0：fb 站上杠面（约 (760,430) 高端），观察翻转 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 120); // 先看自由沉降
  const M = w.mechanisms;
  console.log(`\n[F] roman r0 自由沉降 120f: bar=${fmt(M.romans[0].bar)} angle=${(M.romans[0].bar.GetAngle() * 180 / Math.PI).toFixed(2)}`);
  const fb = w.players.fireboy;
  fb.body.SetPosition(new w.B.b2Vec2(-760 / 32, -420 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 480; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 120 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} bar=${fmt(M.romans[0].bar)} angle=${(M.romans[0].bar.GetAngle() * 180 / Math.PI).toFixed(2)}`);
  }
}

// ---- G. 罗马杆 r1：新世界自由沉降 + fb 站高端 (1020,790) ----
{
  const w = makeWorld("forest_24");
  stepN(w, 120);
  const M = w.mechanisms;
  console.log(`\n[G] roman r1 自由沉降 120f: bar=${fmt(M.romans[1].bar)} angle=${(M.romans[1].bar.GetAngle() * 180 / Math.PI).toFixed(2)}`);
  const fb = w.players.fireboy;
  fb.body.SetPosition(new w.B.b2Vec2(-1020 / 32, -780 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 480; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 120 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} bar=${fmt(M.romans[1].bar)} angle=${(M.romans[1].bar.GetAngle() * 180 / Math.PI).toFixed(2)}`);
  }
}

// ---- H. 箱子：水平推力滑动校准（50/100/150N 各 120f）+ 落差 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 120);
  const box = w.mechanisms.props[0].body;
  console.log(`\n[H] 箱子沉降 120f: ${fmt(box)}`);
  for (const F of [50, 100, 150]) {
    const x0 = sx(box);
    for (let i = 0; i < 120; i++) { box.ApplyForce(new w.B.b2Vec2(-F, 0), box.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
    console.log(`  b2力(-${F},0)=屏幕向右 ${F}N×120f: x ${x0} -> ${sx(box)} (Δ=${(sx(box) - x0).toFixed(1)}px)`);
  }
}
console.log("\ndone");

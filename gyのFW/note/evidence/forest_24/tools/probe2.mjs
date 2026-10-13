// flashbp24b 补充探针: 平台-地面接触实证 / 玩家压推块 / 罗马杆高端翻转 / 箱子接触与双向推 / 滑轮卸载行为
// 运行位置: TEMP/flashbp24/（相对路径 ../../scripts = gyのFW 根）；非游玩输入，仅机构实测
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const stepN = (w, n) => { for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} }); };
const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
const fmt = (b) => `(${sx(b)},${sy(b)})`;
const ang = (b) => +(b.GetAngle() * 180 / Math.PI).toFixed(2);

// ---- [P1] 平台 state=1 全伸位：与地面接触数 + wg 载人随行 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const plat = M.platforms[0];
  const wg = w.players.watergirl;
  wg.body.SetPosition(new w.B.b2Vec2(-112 / 32, -478.8 / 32));
  wg.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  stepN(w, 30);
  console.log(`[P1] 平台载人: wg=${fmt(wg.body)} plat=${fmt(plat.body)} state=${plat.state}`);
  plat.state = 1; plat.signalApply();
  for (let f = 0; f <= 180; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 60 === 0) console.log(`  f${f}: wg=${fmt(wg.body)} plat=${fmt(plat.body)}`);
  }
  // 接触计数（平台体 vs 任意 ground 体）
  const W = w.built?.world ?? w.world;
  let contactN = 0, touching = [];
  for (let ce = W.GetContactList(); ce; ce = ce.GetNext()) {
    const a = ce.GetFixtureA().GetBody(), b = ce.GetFixtureB().GetBody();
    const names = [String(a.GetUserData()), String(b.GetUserData())];
    if (ce.IsTouching && ce.IsTouching()) {
      if (names.includes("null") && (sx(a) === 208.3 || sx(b) === 208.3)) { contactN++; touching.push(names.join("|")); }
    }
  }
  console.log(`  全伸位平台 touching contacts: ${contactN} [${touching.slice(0, 3).join(";")}]`);
}

// ---- [P2] 玩家重量压推块 g3 → 平台联动（游戏真实触发路径）----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  // 推块梯形顶面 512-19.2=492.8 → fb 站上: center=492.8-35.2=457.6
  fb.body.SetPosition(new w.B.b2Vec2(-1152 / 32, -457.6 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  console.log("\n[P2] fb 站推块(1152,492.8顶) → g3 平台联动:");
  for (let f = 0; f <= 240; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 60 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} t=${M.pushers[0].joint.GetJointTranslation().toFixed(3)} st=${M.pushers[0].state} plat=${fmt(M.platforms[0].body)}`);
  }
  // fb 跳开（传走）→ 回弹
  fb.body.SetPosition(new w.B.b2Vec2(-900 / 32, -400 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 180; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 60 === 0) console.log(`  离开+${f}: t=${M.pushers[0].joint.GetJointTranslation().toFixed(3)} st=${M.pushers[0].state} plat=${fmt(M.platforms[0].body)}`);
  }
}

// ---- [P3] 罗马杆 r0 高端（屏幕左 x≈430）站立 → 是否翻转 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 240); // 自由沉降
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  console.log(`\n[P3] r0 高端站立: 沉降后 bar=${fmt(M.romans[0].bar)} angle=${ang(M.romans[0].bar)} box=${fmt(M.props[0].body)}`);
  fb.body.SetPosition(new w.B.b2Vec2(-430 / 32, -400 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 420; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 105 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} bar=${fmt(M.romans[0].bar)} angle=${ang(M.romans[0].bar)}`);
  }
}

// ---- [P4] 罗马杆 r1 高端（屏幕左 x≈620）站立 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  console.log(`\n[P4] r1 高端站立: 沉降后 bar=${fmt(M.romans[1].bar)} angle=${ang(M.romans[1].bar)}`);
  fb.body.SetPosition(new w.B.b2Vec2(-620 / 32, -780 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 420; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 105 === 0) console.log(`  f${f}: fb=${fmt(fb.body)} bar=${fmt(M.romans[1].bar)} angle=${ang(M.romans[1].bar)}`);
  }
}

// ---- [P5] 箱子：接触面盘点 + 左推（屏幕左=离开罗马杆方向）----
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const box = w.mechanisms.props[0].body;
  console.log(`\n[P5] 箱子接触盘点: box=${fmt(box)} angle=${ang(box)} mass=${box.GetMass().toFixed(3)}`);
  for (let ce = (w.built?.world ?? w.world).GetContactList(); ce; ce = ce.GetNext()) {
    if (!ce.IsTouching || !ce.IsTouching()) continue;
    const a = ce.GetFixtureA().GetBody(), b = ce.GetFixtureB().GetBody();
    if (a === box || b === box) {
      const other = a === box ? b : a;
      console.log(`  touching: other pos=${fmt(other)} ud=${JSON.stringify(other.GetUserData())}`);
    }
  }
  // 左推 50N（屏幕左 = physics +x）
  let x0 = sx(box);
  for (let i = 0; i < 120; i++) { box.ApplyForce(new w.B.b2Vec2(50, 0), box.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
  console.log(`  左推 50N×120f: x ${x0} -> ${sx(box)} (Δ=${(sx(box) - x0).toFixed(1)}) angle=${ang(box)}`);
  // 左推 150N
  x0 = sx(box);
  for (let i = 0; i < 120; i++) { box.ApplyForce(new w.B.b2Vec2(150, 0), box.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
  console.log(`  左推 150N×120f: x ${x0} -> ${sx(box)} (Δ=${(sx(box) - x0).toFixed(1)})`);
  // 撤力后滑行
  x0 = sx(box);
  stepN(w, 120);
  console.log(`  撤力滑行 120f: x ${x0} -> ${sx(box)} (Δ=${(sx(box) - x0).toFixed(1)})`);
}

// ---- [P6] 右推重测（新世界，先左推让开罗马杆尖端再右推）----
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const box = w.mechanisms.props[0].body;
  for (let i = 0; i < 120; i++) { box.ApplyForce(new w.B.b2Vec2(100, 0), box.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
  const xa = sx(box);
  console.log(`\n[P6] 先左推100N×120f -> x=${xa} angle=${ang(box)}`);
  for (let i = 0; i < 120; i++) { box.ApplyForce(new w.B.b2Vec2(-100, 0), box.GetWorldCenter()); w.step(1 / 60, { fireboy: {}, watergirl: {} }); }
  console.log(`  再右推100N×120f: x ${xa} -> ${sx(box)} (Δ=${(sx(box) - xa).toFixed(1)}) angle=${ang(box)}`);
}

// ---- [P7] 滑轮卸载：fb 随板到底后传送离开 → 双板是否保持 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  fb.body.SetPosition(new w.B.b2Vec2(-400 / 32, -640 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  stepN(w, 300); // 落板1沉到底
  console.log(`\n[P7] 滑轮卸载: 载荷稳态 p1=${fmt(M.pulleys[0].plat1)} p2=${fmt(M.pulleys[0].plat2)} fb=${fmt(fb.body)}`);
  fb.body.SetPosition(new w.B.b2Vec2(-400 / 32, -300 / 32)); // 传送走
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 300; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 150 === 0) console.log(`  卸载+${f}: p1=${fmt(M.pulleys[0].plat1)} p2=${fmt(M.pulleys[0].plat2)}`);
  }
}

// ---- [P8] 双人同板：fb+wg 都上板1 → 沉降深度 ----
{
  const w = makeWorld("forest_24");
  stepN(w, 30);
  const M = w.mechanisms;
  const fb = w.players.fireboy, wg = w.players.watergirl;
  fb.body.SetPosition(new w.B.b2Vec2(-390 / 32, -640 / 32));
  fb.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  wg.body.SetPosition(new w.B.b2Vec2(-412 / 32, -600 / 32));
  wg.body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  for (let f = 0; f <= 360; f++) {
    w.step(1 / 60, { fireboy: {}, watergirl: {} });
    if (f % 120 === 0) console.log(`[P8] 双人板1 f${f}: fb=${fmt(fb.body)} wg=${fmt(wg.body)} p1=${fmt(M.pulleys[0].plat1)} p2=${fmt(M.pulleys[0].plat2)}`);
  }
}

console.log("\ndone");

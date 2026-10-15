// r24a 探针1：森林24 核心机制链 —— 按钮/平台/箱推/r1杆/跳跃顶点
// 运行: node --import tsx TEMP/r24a/probe1.mjs   (cwd = gyのFW 根)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
const P = (b) => `(${sx(b)},${sy(b)})`;
const ang = (b) => +(b.GetAngle() * 180 / Math.PI).toFixed(2);
const still = { fireboy: {}, watergirl: {} };
const stepN = (w, n, inp = still) => { for (let i = 0; i < n; i++) w.step(1 / 60, inp); };
const setp = (w, body, x, y) => { body.SetPosition(new w.B.b2Vec2(-x / 32, -y / 32)); body.SetLinearVelocity(new w.B.b2Vec2(0, 0)); };

// ============ [J] 静止满跳标定 + 起跳速度语义 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 120);
  const fb = w.players.fireboy.body;
  setp(w, fb, 300, 896 - 35.2); // 主底板站立
  stepN(w, 30);
  let y0 = sy(fb), apex = y0, vyAtJump = 0;
  for (let f = 0; f < 90; f++) {
    w.step(1 / 60, { fireboy: { up: f < 3, left: false, right: false }, watergirl: {} });
    if (f === 1) vyAtJump = fb.GetLinearVelocity().y;
    apex = Math.min(apex, sy(fb));
  }
  console.log(`[J] 站立满跳: y0=${y0} apex=${apex} rise=${(y0 - apex).toFixed(1)}px jump后vy(物理)=${vyAtJump.toFixed(2)} (15.5=${15.5})`);
}

// ============ [B1] 箱压按钮：t/state/平台常开稳定性 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const box = M.props[0].body;
  setp(w, box, 1152, 470); // 箱心放到按钮正上方落下
  console.log(`\n[B1] 箱落按钮: box=${P(box)} pusherT=`);
  let open = 0;
  for (let f = 0; f < 900; f++) {
    w.step(1 / 60, still);
    if (f % 150 === 0) console.log(`  f${f}: box=${P(box)} ang=${ang(box)} t=${M.pushers[0].joint.GetJointTranslation().toFixed(2)} st=${M.pushers[0].state} plat=${P(M.platforms[0].body)}`);
    if (M.platforms[0].state === 1) open++;
  }
  console.log(`  平台 state=1 帧数: ${open}/900`);
}

// ============ [T1] 玩家推箱东行过 r0 杆尖（真实输入推） ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  const box = M.props[0].body;
  // fb 站箱西侧推（箱沉降 352,482 → 箱底 496.6? 实际滚轮着地 482.4 附近）
  setp(w, fb.body, 300, 460);
  stepN(w, 20);
  console.log(`\n[T1] fb推箱东行: box0=${P(box)} pole0=${P(M.romans[0].bar)} ang=${ang(M.romans[0].bar)}`);
  for (let f = 0; f < 1200; f++) {
    w.step(1 / 60, { fireboy: { up: false, left: false, right: true }, watergirl: {} });
    if (f % 120 === 0) console.log(`  f${f}: fb=${P(fb.body)} box=${P(box)} ang=${ang(box)} pole=${ang(M.romans[0].bar)}`);
    if (sx(box) > 1100) { console.log(`  f${f}: 箱过杆到达东侧! box=${P(box)}`); break; }
  }
}

// ============ [R1] r1 杆翻转细节：西端落体 → 东端轨迹/顶点上限 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const wg = w.players.watergirl;
  const bar = M.romans[1].bar;
  console.log(`\n[R1] r1 沉降: bar=${P(bar)} ang=${ang(bar)}`);
  // wg 从高处落到西端（模拟跳落冲击）
  setp(w, wg.body, 620, 700);
  let maxTipY = 0, tipX = 0;
  for (let f = 0; f < 400; f++) {
    w.step(1 / 60, still);
    const a = bar.GetAngle() * Math.PI / 180;
    // 东顶尖端点: 本地 (+256px? 物理米: +8m, +0.3m) 旋转
    const tip = { x: bar.GetPosition().x + 8 * Math.cos(a) - 0.3 * Math.sin(a) * 0, y: bar.GetPosition().y + 8 * Math.sin(a) + 0.3 * Math.cos(a) };
    const tipScreenY = -tip.y * 32;
    if (tipScreenY < maxTipY || maxTipY === 0) { maxTipY = Math.min(maxTipY === 0 ? 9999 : maxTipY, tipScreenY); tipX = -tip.x * 32; }
    if (f % 60 === 0) console.log(`  f${f}: bar ang=${ang(bar)} 东顶尖≈(${tipX.toFixed(0)},${tipScreenY.toFixed(1)}) wg=${P(wg.body)}`);
  }
  console.log(`  东顶尖最高(屏幕y最小)=${maxTipY.toFixed(1)} @x=${tipX.toFixed(0)}（檐台顶672, 需跳153 → 满跳123 差30）`);
}

// ============ [R2] 翻转后东端载人静态跳：顶点实测 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const bar = M.romans[1].bar;
  const fb = w.players.fireboy;
  // 直接翻转（落体冲击）：fb 从高处落西端
  setp(w, fb.body, 620, 700);
  stepN(w, 300);
  console.log(`\n[R2] 翻转后: bar ang=${ang(bar)}（负=东高）`);
  // fb 上东顶尖站立（顶面 x≈1086 处表面 y≈825）: 站立中心 = 面-35.2
  const a = bar.GetAngle();
  const surfY = sy(bar) - 0; // 计算表面太麻烦，直接把 fb 放到 (1080, 825-35+2) 让物理沉降
  setp(w, fb.body, 1075, 825 - 35.2 + 3);
  stepN(w, 60);
  console.log(`  fb 站东尖端: ${P(fb.body)}（面≈825）`);
  let apex = sy(fb.body);
  for (let f = 0; f < 90; f++) {
    w.step(1 / 60, { fireboy: { up: f < 3, left: false, right: false }, watergirl: {} });
    apex = Math.min(apex, sy(fb.body));
  }
  console.log(`  满跳 apex=${apex.toFixed(1)}（檐台672 → ${apex <= 672 ? "可达" : "差 " + (apex - 672).toFixed(1) + "px"}）`);
}

// ============ [R3] 箱静态放到翻转杆东端不同臂位：沉降角/箱顶高度/稳定性 ============
for (const arm of [160, 190, 220, 245]) {
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const bar = M.romans[1].bar;
  const fb = w.players.fireboy;
  setp(w, fb.body, 620, 700); // 翻转
  stepN(w, 300);
  const box = M.props[0].body;
  setp(w, box, 300, 860); stepN(w, 40); // 先落地
  const a0 = bar.GetAngle();
  // 东向臂位 arm(px) 处顶面点: pivot(832,864) + arm·(cosθ,-sinθ) θ=|angle|
  const th = Math.abs(a0);
  const px = 832 + arm * Math.cos(th), py = 864 - arm * Math.sin(th) - 9.7;
  setp(w, box, px, py - 28.3);
  let minTop = 9999;
  for (let f = 0; f < 300; f++) {
    w.step(1 / 60, still);
    if (f % 100 === 0) console.log(`[R3 arm=${arm}] f${f}: box=${P(box)} ang=${ang(box)} pole=${ang(bar)} 箱顶≈${(sy(box) - 28.3).toFixed(1)}`);
    minTop = Math.min(minTop, sy(box) - 28.3);
  }
  console.log(`[R3 arm=${arm}] 终态: box=${P(box)} pole=${ang(bar)} 箱顶最低=${minTop.toFixed(1)}（fb立箱顶跳需箱顶≤${672 + 123}内才可达檐台: 箱顶≤795 → 跳后脚≤672）`);
}

// ============ [F1] 下井漏斗：双人穿缺口落点 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  M.pushers[0].state = 1; M.pushers[0].signalApply(); // 直开
  const fb = w.players.fireboy, wg = w.players.watergirl;
  setp(w, fb.body, 110, 470); setp(w, wg.body, 130, 470);
  for (let f = 0; f < 400; f++) {
    w.step(1 / 60, still);
    if (f % 80 === 0) console.log(`[F1] f${f}: fb=${P(fb.body)} wg=${P(wg.body)} plat=${P(M.platforms[0].body)}`);
  }
}
console.log("\ndone");

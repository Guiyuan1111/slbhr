// r24a 探针2：冲撞翻越 / 翻转携带 / 配重平衡 / 纯满跳顶点 / 下井窗口精测
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const sx = (b) => +(b.GetPosition().x * -32).toFixed(1);
const sy = (b) => +(b.GetPosition().y * -32).toFixed(1);
const P = (b) => `(${sx(b)},${sy(b)})`;
const ang = (b) => +(b.GetAngle() * 180 / Math.PI).toFixed(2);
const still = { fireboy: {}, watergirl: {} };
const stepN = (w, n, inp = still) => { for (let i = 0; i < n; i++) w.step(1 / 60, inp); };
const setp = (w, body, x, y) => { body.SetPosition(new w.B.b2Vec2(-x / 32, -y / 32)); body.SetLinearVelocity(new w.B.b2Vec2(0, 0)); };

// ============ [J2] 纯净满跳顶点（开阔地） ============
{
  const w = makeWorld("forest_24");
  stepN(w, 120);
  const fb = w.players.fireboy.body;
  setp(w, fb, 950, 896 - 35.2); // 主底板 x950 开阔（上方无遮挡：r1 杆在 y825+ 下方? 杆顶面 825-895 在脚下，头顶 y544 中央地板底——净空 896-544=352 ✓）
  stepN(w, 30);
  const y0 = sy(fb);
  let apex = y0;
  for (let f = 0; f < 90; f++) {
    w.step(1 / 60, { fireboy: { up: f < 3, left: false, right: false }, watergirl: {} });
    apex = Math.min(apex, sy(fb));
  }
  console.log(`[J2] 纯净满跳: y0=${y0} apex=${apex} rise=${(y0 - apex).toFixed(1)}px （理论 123.1）`);
}

// ============ [A] 冲撞翻越：fb 反复助跑撞箱过 r0 杆尖 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  const box = M.props[0].body;
  console.log(`\n[A] 冲撞: box0=${P(box)} r0尖在~(362,440)`);
  // 冲撞循环：跑到箱西侧撞，回撤 150px 再冲
  let phase = "back", backF = 0, maxX = 0;
  for (let f = 0; f < 3000; f++) {
    const bx = sx(box), fx = sx(fb.body);
    let right = false, left = false;
    if (phase === "back") { left = true; backF++; if (backF > 55) { phase = "charge"; backF = 0; } }
    else { right = true; if (fx > bx - 10) { phase = "back"; } }
    w.step(1 / 60, { fireboy: { up: false, left, right }, watergirl: {} });
    maxX = Math.max(maxX, sx(box));
    if (f % 300 === 0) console.log(`  f${f}: fb=${P(fb.body)} box=${P(box)} ang=${ang(box)} maxX=${maxX}`);
    if (sx(box) > 430) { console.log(`  f${f}: ★箱过杆尖! box=${P(box)}`); break; }
  }
  console.log(`  终: box=${P(box)} ang=${ang(box)} maxX=${maxX}（>425=过西底角）`);
}

// ============ [A2] 冲撞加强：双人同时冲撞 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const fb = w.players.fireboy, wg = w.players.watergirl;
  const box = M.props[0].body;
  setp(w, wg.body, 250, 460); stepN(w, 20);
  let phase = "back", backF = 0, maxX = 0;
  for (let f = 0; f < 2400; f++) {
    const bx = sx(box), fx = sx(fb.body), gx = sx(wg.body);
    let right = false, left = false;
    if (phase === "back") { left = true; backF++; if (backF > 55) { phase = "charge"; backF = 0; } }
    else { right = true; if (fx > bx - 10 && gx > bx - 20) phase = "back"; }
    w.step(1 / 60, { fireboy: { up: false, left, right }, watergirl: { up: false, left, right } });
    maxX = Math.max(maxX, sx(box));
    if (f % 400 === 0) console.log(`[A2] f${f}: fb=${P(fb.body)} wg=${P(wg.body)} box=${P(box)} ang=${ang(box)}`);
    if (sx(box) > 430) { console.log(`[A2] f${f}: ★双人撞过杆尖!`); break; }
  }
  console.log(`[A2] 终: box=${P(box)} ang=${ang(box)} maxX=${maxX}`);
}

// ============ [C] 翻转携带：箱顶死 r1 东端坡 + wg 落西端翻转 → 箱去向 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const box = M.props[0].body;
  const bar = M.romans[1].bar;
  const wg = w.players.watergirl;
  // 箱推到东端坡前：直接放 (1000,866)（地面），它应顶死在坡
  setp(w, box, 1000, 866); stepN(w, 30);
  console.log(`\n[C] 箱顶死东坡: box=${P(box)} ang=${ang(box)} pole=${ang(bar)}`);
  // wg 高处落西端
  setp(w, wg.body, 620, 700);
  for (let f = 0; f < 420; f++) {
    w.step(1 / 60, still);
    if (f % 70 === 0) console.log(`  f${f}: box=${P(box)} ang=${ang(box)} pole=${ang(bar)} wg=${P(wg.body)}`);
  }
  console.log(`  终态: box=${P(box)} ang=${ang(box)} pole=${ang(bar)}`);
}

// ============ [D] 配重平衡：wg 站西尖 + 箱放东顶面（翻转态）→ 杆保持? fb 上箱跳? ============
for (const arm of [140, 156, 175]) {
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const bar = M.romans[1].bar;
  const fb = w.players.fireboy, wg = w.players.watergirl;
  const box = M.props[0].body;
  // 先翻转 r1
  setp(w, fb.body, 620, 700); stepN(w, 300);
  // wg 站西顶尖（面 ~883 → C=848）
  setp(w, wg.body, 590, 845); stepN(w, 90);
  // 箱放东顶面 arm 处
  const th = Math.abs(bar.GetAngle());
  const px = 832 + arm * Math.cos(th), py = 864 - arm * Math.sin(th) - 9.7;
  setp(w, box, px, py - 29);
  let held = 0, boxTopMin = 9999;
  for (let f = 0; f < 240; f++) {
    w.step(1 / 60, still);
    if (ang(bar) < -5) held++;
    boxTopMin = Math.min(boxTopMin, sy(box) - 28.3);
    if (f % 60 === 0) console.log(`[D arm=${arm}] f${f}: pole=${ang(bar)} box=${P(box)} wg=${P(wg.body)} 箱顶=${(sy(box) - 28.3).toFixed(1)}`);
  }
  console.log(`[D arm=${arm}] 保持帧=${held}/240 箱顶最低=${boxTopMin.toFixed(1)}（≤795 时 fb 立箱满跳脚可达 672）`);
  if (held > 200) {
    // fb 上箱跳：直接放到箱顶再跳
    setp(w, fb.body, sx(box), sy(box) - 28.3 - 35.2 + 2);
    stepN(w, 45);
    let apex = sy(fb.body);
    for (let f = 0; f < 80; f++) {
      w.step(1 / 60, { fireboy: { up: f < 3, left: false, right: false }, watergirl: {} });
      apex = Math.min(apex, sy(fb.body));
    }
    console.log(`[D arm=${arm}] fb立箱顶(站${P(fb.body)})满跳 apex C=${apex.toFixed(1)}（需≤636.8）`);
  }
}

// ============ [W] 下井窗口精测：离钮后平台西缘回到 x104/96/64 的帧数 ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const M = w.mechanisms;
  const fb = w.players.fireboy;
  setp(w, fb.body, 1152, 457.6); stepN(w, 90); // 站钮直到 state=1 全开
  const st1 = M.pushers[0].state;
  // 瞬移离开（模拟跳走）
  setp(w, fb.body, 1100, 400);
  let t60 = 0, platW = M.platforms[0].body;
  for (let f = 0; f < 400; f++) {
    w.step(1 / 60, still);
    const westEdge = sx(platW) - 48;
    if (f % 20 === 0) console.log(`[W] f${f}: t=${M.pushers[0].joint.GetJointTranslation().toFixed(2)} st=${M.pushers[0].state} plat西缘=${westEdge.toFixed(0)}（<104 可过人）`);
  }
  console.log(`[W] 开局 st=${st1}`);
}

// ============ [RUN] 实跑计时：按钮→缺口 最快真实跑（含 r0 杆跨越） ============
{
  const w = makeWorld("forest_24");
  stepN(w, 240);
  const fb = w.players.fireboy;
  setp(w, fb.body, 1152, 470); stepN(w, 60);
  // 跑西：遇杆跳上，下杆，直奔缺口
  let f = 0;
  const trace = [];
  for (; f < 500; f++) {
    const x = sx(fb.body);
    const jump = (x > 800 && x < 1080) || (x > 300 && x < 460); // 上杆/下杆跳
    w.step(1 / 60, { fireboy: { up: jump, left: true, right: false }, watergirl: {} });
    if (f % 40 === 0) trace.push(`f${f}:${P(fb.body)}`);
    if (x < 130) break;
  }
  console.log(`\n[RUN] 按钮西跑到 x<130 用时 ${f}f`);
  console.log('  ' + trace.join(' '));
}
console.log("\ndone");

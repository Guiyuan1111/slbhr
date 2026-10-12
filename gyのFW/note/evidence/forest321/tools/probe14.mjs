// r32d probe14：forest_32_1 摆渡人死锁实证电池
// T1: 平台@704 时，从东岸 864 各种起跳配方的最高点（证 160px 不可达）
// T2: 箱压钮后平台 864→704 升程计时（升速 + 可登窗口）
// T4: 球从坑坡顶被轻推 → 滚上按钮的延迟（中途接应的提前量上限）
// T5: 箱在平底(台面)获得速度后自然滑停距离（证压钮需持续推）
// 用法: node --import tsx TEMP/r32/probe14.mjs <T1|T2|T4|T5>
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);

const NOIN = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const UR = { up: true, left: false, right: true };
const px2m = (px) => -px / 32;

const w = makeWorld("forest_32_1");
let frame = 0;
const feetOf = (role) => { const s = w.snapshotPlayer(role); return { x: s.x, feet: s.y + 35.2, dying: s.dying }; };
const boxOf = () => { const b = w.mechs.props.find((p) => p.kind.startsWith("box")); const p = b.body.GetPosition(); return { x: -p.x * 32, y: -p.y * 32, body: b.body }; };
const ballOf = () => { const b = w.mechs.props.find((p) => p.kind.startsWith("ball")); const p = b.body.GetPosition(); return { x: -p.x * 32, y: -p.y * 32, body: b.body }; };
const platTop = () => { const q = w.mechs.platforms[1].body.GetPosition(); return -q.y * 32 - 16; };
function teleport(role, x, yTop) {
  const body = w.players[role].body;
  body.SetPosition(new w.B.b2Vec2(px2m(x), px2m(yTop - 35.2)));
  body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  body.SetAwake(true);
}
function teleportBody(body, x, yCenter) {
  body.SetPosition(new w.B.b2Vec2(px2m(x), px2m(yCenter)));
  body.SetLinearVelocity(new w.B.b2Vec2(0, 0));
  body.SetAwake(true);
}
function seg(dur, fbIn = NOIN, wgIn = NOIN, track = null) {
  let peak = null; // track: "fb"|"wg" → 记录最高点(min feet)
  for (let i = 0; i < dur; i++) {
    w.step(1 / 60, { fireboy: fbIn, watergirl: wgIn });
    frame++;
    if (track) { const f = feetOf(track === "fb" ? "fireboy" : "watergirl"); if (f.dying) { console.log(`  f${frame} DEAD`); return peak; } if (peak === null || f.feet < peak.feet) peak = { ...f }; }
    if (feetOf("fireboy").dying || feetOf("watergirl").dying) { console.log(`  f${frame} DEAD fb(${feetOf("fireboy").x.toFixed(0)},${feetOf("fireboy").feet.toFixed(1)}) wg(${feetOf("watergirl").x.toFixed(0)},${feetOf("watergirl").feet.toFixed(1)})`); process.exit(1); }
  }
  return peak;
}
// 把箱放到按钮上并等平台升满 → 返回升程帧数
function boxOnButtonRise() {
  const bx = boxOf();
  teleportBody(bx.body, 1150, 880); // 按钮区中心 [1120,1184]
  let t = 0;
  seg(5);
  const startTop = platTop();
  let last = startTop;
  while (platTop() > 704.5 && t < 600) { seg(1); t++; last = platTop(); }
  return { riseF: t, from: startTop, to: last };
}

const mode = process.argv[2] ?? "T1";
seg(3);

if (mode === "T1") {
  console.log("== T1: 平台@704 从东岸(864)起跳的最高点（需 160px 才能登台; 满持跳理论 123px） ==");
  const r = boxOnButtonRise();
  console.log(`平台升满: ${r.riseF}f 864→${r.to.toFixed(1)} (plat.top=${platTop().toFixed(1)})`);
  const tryJump = (name, x, y, setupSegs) => {
    teleport("watergirl", x, y); seg(20);
    if (setupSegs) setupSegs();
    const s0 = feetOf("watergirl");
    let pk = null;
    const runTrack = (dur, input) => { for (let i = 0; i < dur; i++) { w.step(1 / 60, { fireboy: NOIN, watergirl: input }); frame++; const s = feetOf("watergirl"); if (pk === null || s.feet < pk.feet) pk = { ...s }; } };
    runTrack(25, UL); runTrack(60, L); runTrack(40, NOIN); // 25f 满持跳 + 西漂 + 落定
    const after = feetOf("watergirl");
    console.log(`${name}: 起点(${s0.x.toFixed(0)},${s0.feet.toFixed(1)}) 最高(${pk.x.toFixed(0)},${pk.feet.toFixed(1)}) 升幅=${(s0.feet - pk.feet).toFixed(1)}px 落点(${after.x.toFixed(0)},${after.feet.toFixed(1)}) ${after.feet < 705 && after.x < 100 ? "登上平台!" : `最高点距台顶704差 ${(pk.feet - 704).toFixed(1)}px`}`);
  };
  tryJump("岸上满持跳(25f) @150", 150, 864, null);
  tryJump("岸上满持跳 @200", 200, 864, null);
  tryJump("岸东缘满持跳 @280", 280, 864, null);
  // 液面起跳：水中 300 (水面 feet~878)
  tryJump("水面起跳 @300", 300, 878, null);
  // 墙助：贴平台东面 x~108（半宽~10 → 中心108）
  tryJump("贴墙满持跳 @108", 108, 864, null);
  // 助跑: 30f L 冲刺后起跳（西向）
  { teleport("watergirl", 200, 864); seg(20);
    const s0 = feetOf("watergirl"); let pk = null;
    const runTrack = (dur, input) => { for (let i = 0; i < dur; i++) { w.step(1 / 60, { fireboy: NOIN, watergirl: input }); frame++; const s = feetOf("watergirl"); if (pk === null || s.feet < pk.feet) pk = { ...s }; } };
    runTrack(30, L); runTrack(25, UL); runTrack(60, L); runTrack(40, NOIN);
    const after = feetOf("watergirl");
    console.log(`助跑30f+满持跳: 起点(${s0.x.toFixed(0)},${s0.feet.toFixed(1)}) 最高(${pk.x.toFixed(0)},${pk.feet.toFixed(1)}) 升幅=${(s0.feet - pk.feet).toFixed(1)}px 落点(${after.x.toFixed(0)},${after.feet.toFixed(1)}) ${after.feet < 705 && after.x < 100 ? "登上平台!" : `最高点距台顶差 ${(pk.feet - 704).toFixed(1)}px`}`);
  }
} else if (mode === "T2") {
  console.log("== T2: 箱压钮 → 平台 864→704 升程计时 ==");
  for (let i = 0; i < 3; i++) {
    // 平台先降回底（拿走箱）
    const bx = boxOf(); teleportBody(bx.body, 400, 400); // 悬空远离
    let d = 0; while (platTop() < 863.5 && d < 800) { seg(1); d++; }
    const r = boxOnButtonRise();
    console.log(`#${i} 按下→升满: ${r.riseF}f (${(864 - 704) / r.riseF > 0 ? ((864 - 704) / r.riseF).toFixed(3) : "?"}px/f) 到761可登线窗口≈${Math.round((864 - 761) / ((864 - 704) / r.riseF))}f`);
  }
} else if (mode === "T4") {
  console.log("== T4: 球从坑坡顶轻推 → 滚上按钮延迟 ==");
  // 坡顶 ~x995 台面856 → 球滚下坡入坑底 → 按钮[1120,1184]@896
  for (const push of [{ f: 10, v: "轻推10f" }, { f: 30, v: "推30f" }]) {
    // 重置球
    const ball = ballOf(); teleportBody(ball.body, 995, 840);
    const bx = boxOf(); teleportBody(bx.body, 400, 400);
    let d = 0; while (platTop() < 863.5 && d < 800) { seg(1); d++; }
    teleport("watergirl", 960, 856); seg(10);
    let t = 0; let pressed = -1; let ballEnd = null;
    while (t < 700) {
      w.step(1 / 60, { fireboy: NOIN, watergirl: t < push.f ? R : NOIN });
      frame++; t++;
      const b = ballOf();
      if (platTop() < 863.5 && pressed < 0) pressed = t;
      if (t % 60 === 0) console.log(`  t${t} ball(${b.x.toFixed(0)},${b.y.toFixed(0)}) plat=${platTop().toFixed(0)}`);
      if (pressed > 0 && t > pressed + 200) { ballEnd = b; break; }
    }
    console.log(`${push.v}: 压钮延迟=${pressed < 0 ? "未压到" : pressed + "f"} 200f后球位(${ballOf().x.toFixed(0)},${ballOf().y.toFixed(0)}) plat=${platTop().toFixed(0)}`);
  }
} else if (mode === "T5") {
  console.log("== T5: 箱平底滑停距离（台面856, 东向） ==");
  const bx0 = boxOf();
  for (const pushF of [60, 120, 300]) {
    const bx = boxOf(); teleportBody(bx.body, 700, 840);
    teleport("watergirl", 660, 856); seg(15);
    const x0 = boxOf().x;
    let t = 0;
    while (t < 400) { w.step(1 / 60, { fireboy: NOIN, watergirl: t < pushF ? R : NOIN }); frame++; t++; const b = boxOf(); if (b.x > 1005) { console.log(`  推${pushF}f: 箱到坡口(${b.x.toFixed(0)})停止(下坡)`); break; } if (t === pushF + 1) console.log(`  推${pushF}f 结束时箱位=${b.x.toFixed(0)}`); if (t === pushF + 200) { console.log(`  松手200f后箱停位=${b.x.toFixed(0)} (滑行${(b.x - 0).toFixed(0)})`); break; } }
  }
}
console.log("done");

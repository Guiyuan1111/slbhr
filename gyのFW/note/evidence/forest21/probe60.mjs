// t26: g1 风柱决胜实验——乘升是否永被架子销钉（无任何变体上穿/入滑槽）
// 变体：A1-A4 静止乘升(x=180/200/220/240)；B1 全速奔跑入柱(x vx≈4.55)；C1 x192 落地即跳
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const px = b => { const p = b.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; };

function run(name, plan) {
  const w = makeWorld("forest_21");
  const wg = w.chars.watergirl.body;
  let minY = 1e9, breach = false, chute = false, shelf = false, windOn = -1;
  const samples = [];
  for (let f = 1; f <= 1300; f++) {
    const p = px(wg);
    const cmd = { up: false, left: false, right: false };
    plan(f, p, cmd, w);
    if (w.mechs.winds[0].state === 1 && windOn < 0) windOn = f;
    minY = Math.min(minY, p.y);
    if (p.y < 150) breach = true;                 // 头部越过架子底面高度
    if (p.x > 258 && p.y < 190) chute = true;     // 进入滑槽区
    if (p.y < 100) shelf = true;                  // 站上架子顶面高度(92.8)
    if (f % 100 === 0) samples.push(`  f${f} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`);
    w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: cmd });
  }
  const p = px(wg);
  const dcol = w.diamonds.filter(d => d.collected).map(d => `${d.char}@${d.x},${d.y}`).join(" ") || "-";
  console.log(`[${name}] windOn=f${windOn} minY=${minY.toFixed(1)} breach<150=${breach} chute=${chute} shelfStand=${shelf}`);
  console.log(`  final x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}  diamonds: ${dcol}`);
  console.log(samples.join("\n"));
}

// —— A: 走到目标 x 停稳 → f=200 开风 → 静置观察
for (const tx of [180, 200, 220, 240]) {
  run(`A@${tx}`, (f, p, cmd, w) => {
    if (f > 3 && p.x < tx) cmd.right = true;
    if (f === 200) w.mechs.winds[0].state = 1;   // 仅置位（传感器自动），不 setActive
  });
}

// —— B: 全速奔跑入柱，f=12 开风（vx≈4.55 动量乘升）
run("B-run", (f, p, cmd, w) => {
  if (f > 3) cmd.right = true;                   // 一路向东（墙 x241.6 截停）
  if (f === 12) w.mechs.winds[0].state = 1;
});

// —— C: x192 停稳 → 开风同帧起跳（叠加 v0 上冲）
run("C-jump@192", (f, p, cmd, w) => {
  if (f > 3 && p.x < 192) cmd.right = true;
  if (f === 200) { w.mechs.winds[0].state = 1; }
  if (f >= 200 && f <= 203) cmd.up = true;
});

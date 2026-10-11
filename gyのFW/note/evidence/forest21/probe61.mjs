// t35: FB v3——檐口跳→塔顶 perch→西走下落→g3 带/偏导承接→大置物架顶→R656→门
// 用法: node t35.mjs [jumpF=23] [holdUp=8]
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const JUMP_F = process.argv[2] ? parseInt(process.argv[2]) : 23;
const HOLD_UP = process.argv[3] ? parseInt(process.argv[3]) : 8;
const px = b => { const p = b.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; };
const w = makeWorld("forest_21");
const fb = w.chars.fireboy.body;
const log = [], events = [];
let phase = "run", jumped = -1;
for (let f = 1; f <= 400; f++) {
  const p = px(fb);
  const cmd = { up: false, left: false, right: false };
  if (f <= 2) { /* warmup */ }
  else if (phase === "run") {
    cmd.left = true;
    if (f >= JUMP_F) { cmd.up = true; jumped = f; phase = "fly"; }
  } else if (phase === "fly") {
    if (f - jumped <= HOLD_UP) cmd.up = true;
    cmd.left = true;
    if (p.y > 145 && p.y < 172 && p.x > 950 && p.x < 1000) phase = "tower";  // 塔顶 perch
    if (p.y > 175 && p.y < 205 && p.x < 900) phase = "shelf";                // 直接落架顶
  } else if (phase === "tower") {
    cmd.left = true;                                                          // 西走下落→带承接
    if (p.y > 175 && p.y < 205 && p.x < 900) phase = "shelf";
    if (p.x < 900 && p.y > 300) phase = "FAIL";                               // 掉进带下/板台=失败
  } else if (phase === "shelf") {
    cmd.left = true;
    if (p.x <= 512 && p.y < 200) phase = "door";
  } else if (phase === "door") {
    if (p.x > 500) cmd.left = true;
  }
  const v = fb.GetLinearVelocity();
  if (f % 3 === 0 || (jumped > 0 && f >= jumped && f <= jumped + 70))
    log.push(`f${f} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} vx=${(-v.x*32/60).toFixed(2)} vy=${(-v.y*32/60).toFixed(2)} ${phase}`);
  const ev = w.step(1 / 60, { fireboy: cmd, watergirl: { up: false, left: false, right: false } });
  for (const e of ev) events.push(`f${f} ${JSON.stringify(e).slice(0, 120)}`);
}
const p = px(fb);
console.log(`jumped=f${jumped} phase=${phase} final x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`);
console.log("diamonds:", w.diamonds.filter(d => d.collected).map(d => `${d.char}@${d.x},${d.y}`).join(" ") || "-");
console.log(events.slice(0, 14).join("\n"));
console.log(log.filter(l => { const m = l.match(/^f(\d+)/); return m && +m[1] >= 18 && +m[1] <= 130; }).join("\n"));

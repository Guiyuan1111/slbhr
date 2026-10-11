// t29b: FB 上线——左跑62→idle12→(坠入上竖井)→右走出井→板台西走→风带跳→crest→架子顶→R656→门
// 用法: node t29.mjs [jumpX=950] [holdUp=10]
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const JUMP_X = process.argv[2] ? parseFloat(process.argv[2]) : 950;
const HOLD_UP = process.argv[3] ? parseInt(process.argv[3]) : 10;
const px = b => { const p = b.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; };
const w = makeWorld("forest_21");
const fb = w.chars.fireboy.body;
let phase = "walkL", jumped = -1, jumpEnd = -1;
const log = [], events = [];
for (let f = 1; f <= 460; f++) {
  const p = px(fb);
  const cmd = { up: false, left: false, right: false };
  if (f <= 2) { /* warmup */ }
  else if (f <= 64) cmd.left = true;                        // 左跑62f
  else if (f <= 76) { /* idle 12f */ }
  else if (phase === "walkL") { phase = "escapeR"; }        // 进入竖井→右走爬出
  if (phase === "escapeR") {
    cmd.right = true;
    if (p.x >= 1062 && p.y > 300) phase = "slabW";          // 已出井上板台
  } else if (phase === "slabW") {
    if (jumped < 0 && p.x <= JUMP_X) { jumped = f; jumpEnd = f + HOLD_UP; }
    if (jumped > 0 && f <= jumpEnd) cmd.up = true;
    cmd.left = true;
    if (p.x < 880 && p.y < 210) phase = "shelfW";           // 已落架子顶
  } else if (phase === "shelfW") {
    cmd.left = true;
    if (p.x <= 512 && p.y < 200) phase = "door";
  } else if (phase === "door") {
    if (p.x > 500) cmd.left = true;
  }
  if (f % 4 === 0 || (jumped > 0 && f >= jumped && f <= jumped + 45))
    log.push(`f${f} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} ${phase}`);
  const ev = w.step(1 / 60, { fireboy: cmd, watergirl: { up: false, left: false, right: false } });
  for (const e of ev) events.push(`f${f} ${JSON.stringify(e).slice(0, 120)}`);
}
const p = px(fb);
console.log(`jumped=f${jumped} phase=${phase} final x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`);
console.log("diamonds:", w.diamonds.filter(d => d.collected).map(d => `${d.char}@${d.x},${d.y}`).join(" ") || "-");
console.log(events.slice(0, 14).join("\n"));
console.log(log.filter((_, i) => i % 2 === 0).slice(-55).join("\n"));

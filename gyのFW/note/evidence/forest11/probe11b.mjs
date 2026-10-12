// r28: forest_11 连续协作路线内核探针 v3
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;

// ===== 事件表（f≥3，type: down/up 键变沿）=====
const wg = [];
const ev = (arr, f, dir, type) => arr.push({ f, dir, type });
// 1. rr16j22 -> summit(705,800)
ev(wg, 3, "right", "down"); ev(wg, 19, "up", "down"); ev(wg, 20, "up", "up"); ev(wg, 43, "right", "up");
// 2. jl20 -> west slab(579,768)
ev(wg, 75, "left", "down"); ev(wg, 77, "up", "down"); ev(wg, 78, "up", "up"); ev(wg, 96, "left", "up");
// 3. wl110 -> water(428,718)
ev(wg, 105, "left", "down"); ev(wg, 215, "left", "up");
// 4. rl28j6 -> 672-ledge(301,672)
ev(wg, 220, "right", "down"); ev(wg, 248, "up", "down"); ev(wg, 249, "up", "up"); ev(wg, 256, "right", "up");
// 5. jl6 -> 640-ledge(280,640)
ev(wg, 275, "left", "down"); ev(wg, 277, "up", "down"); ev(wg, 278, "up", "up"); ev(wg, 284, "left", "up");
// 6. jl28 -> 544-slab(215,544)
ev(wg, 295, "left", "down"); ev(wg, 297, "up", "down"); ev(wg, 298, "up", "up"); ev(wg, 326, "left", "up");
// 7. rl8j34 -> 448-block(62..129,448)
ev(wg, 345, "left", "down"); ev(wg, 353, "up", "down"); ev(wg, 354, "up", "up"); ev(wg, 388, "left", "up");
// 8. rr8j34 -> 320-slab(160,320)
ev(wg, 405, "right", "down"); ev(wg, 413, "up", "down"); ev(wg, 414, "up", "up"); ev(wg, 448, "right", "up");
// 9. rr16j22 -> S43(226..264,224)
ev(wg, 465, "right", "down"); ev(wg, 481, "up", "down"); ev(wg, 482, "up", "up"); ev(wg, 504, "right", "up");
// 10. rr8j34 -> 320-mid(449,320)
ev(wg, 525, "right", "down"); ev(wg, 533, "up", "down"); ev(wg, 534, "up", "up"); ev(wg, 568, "right", "up");
// 11. walk west off 448 -> 352-slab
ev(wg, 585, "left", "down"); ev(wg, 605, "left", "up");
// 12. walk east -> off 768 -> fall -> mid slab (pressed at column face 874)
ev(wg, 610, "right", "down"); ev(wg, 770, "right", "up");
// 13. micro west to ~850
ev(wg, 775, "left", "down"); ev(wg, 793, "left", "up");
// 14. run right + jump -> column top(~900,352)
ev(wg, 798, "right", "down"); ev(wg, 810, "up", "down"); ev(wg, 811, "up", "up"); ev(wg, 825, "right", "up");
// 15. walk east off column top -> fall -> p0/walkway(987,482)
ev(wg, 845, "right", "down"); ev(wg, 885, "right", "up");
// 16. walk west off walkway -> raised floor(750,864)
ev(wg, 890, "left", "down"); ev(wg, 955, "left", "up");
// 17. walk east to ~798
ev(wg, 960, "right", "down"); ev(wg, 985, "right", "up");
// 18. pre8 jumpR k30 ceiling-slide -> east strip(940,864)
ev(wg, 990, "right", "down"); ev(wg, 998, "up", "down"); ev(wg, 999, "up", "up"); ev(wg, 1029, "right", "up");
// 19. walk east off 960 -> base floor
ev(wg, 1145, "right", "down"); ev(wg, 1200, "right", "up");
// 20. walk east park in door(~1168)
ev(wg, 1205, "right", "down"); ev(wg, 1258, "right", "up");

const fb = [];
// 1. jl14 -> base-top-east(932,864)
ev(fb, 3, "left", "down"); ev(fb, 3, "up", "down"); ev(fb, 4, "up", "up"); ev(fb, 18, "left", "up");
// 2. reposition east ~950
ev(fb, 25, "right", "down"); ev(fb, 40, "right", "up");
// 3. rr8j34 -> 736-slab(1104,736)
ev(fb, 48, "right", "down"); ev(fb, 56, "up", "down"); ev(fb, 57, "up", "up"); ev(fb, 91, "right", "up");
// 4. walk east to runway start ~1240
ev(fb, 100, "right", "down"); ev(fb, 142, "right", "up");
// 5. long run west + jump -> float splash ~870-920; float walk west presses arm (l0 flip)
ev(fb, 148, "left", "down"); ev(fb, 197, "up", "down"); ev(fb, 198, "up", "up"); ev(fb, 335, "left", "up");
// 6. walk west off 704 -> fall -> summit(~700,800)
ev(fb, 345, "left", "down"); ev(fb, 385, "left", "up");
// 7. F6 hold-left 70f -> slides -> floor(450,896)
ev(fb, 395, "left", "down"); ev(fb, 465, "left", "up");
// 8. park in door(432..496) — already at ~450

const totalFrames = 1500;

// ===== 展开 + 回放 =====
function expand(evs) {
  const st = { up:false, left:false, right:false };
  const byF = new Map();
  for (const e of evs) {
    if (!byF.has(e.f)) byF.set(e.f, []);
    byF.get(e.f).push(e);
  }
  return (f) => {
    for (const e of (byF.get(f) ?? [])) st[e.dir] = (e.type === "down");
    return { ...st };
  };
}
const wgGen = expand(wg), fbGen = expand(fb);
const w = makeWorld("forest_11");
let winF = -1, dieF = -1;
const trace = [];
for (let f = 0; f < totalFrames; f++) {
  const inp = { fireboy: fbGen(f), watergirl: wgGen(f) };
  const evs = w.step(DT, inp);
  const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
  if (f % 10 === 0) trace.push(`f${f}: fb(${fbS.x.toFixed(0)},${(fbS.y+35.2).toFixed(0)}) wg(${wgS.x.toFixed(0)},${(wgS.y+35.2).toFixed(0)})`);
  for (const e of evs) {
    if (e.type === "win") { winF = f; }
    if (e.type === "gameover") { dieF = f; }
  }
  if (winF >= 0 || dieF >= 0) break;
}
console.log(trace.join("\n"));
console.log(winF >= 0 ? `\n*** WIN @f${winF} ***` : dieF >= 0 ? `\n!!! GAMEOVER @f${dieF} !!!` : "\n--- no win, no death (timeout) ---");
const l0 = w.mechs.levers.find(l => l.group === 3);
const p1 = w.mechs.platforms.find(p => p.group === 3);
const pp = p1.body.GetPosition();
console.log(`l0=${l0.state}/${l0.angleDeg().toFixed(0)} p1=(${(-pp.x*32).toFixed(0)},${(-pp.y*32).toFixed(0)})`);

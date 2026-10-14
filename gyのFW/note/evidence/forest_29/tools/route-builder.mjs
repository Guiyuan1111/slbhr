// build3.mjs — forest_29 路线构建器 v4（地形带校正后全重排）
// 用法: node --import tsx build3.mjs [--trace out.json] [K=V ...]
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const P = {
  // FB（西侧）
  fA1: 24,               // 板缘跳→池西北角
  fA2: 124,              // 角跳→直落西板y384
  fW2a: 320, fW2b: 336, fJ2: 342, // 西板东行→跳W2水槽→盖板(224-320,384)
  fW3a: 400, fJ3: 423,   // 盖板东行→跳→杠杆臂/立柱(落x~444.6, feet~413-445)
  fW4: [458, 462],       // 落臂后慢速西行4f(v~25)→走出臂西端→落640沿台(416-448)
  fJ4bh: [505, 512], fJ4b: 513, fJ4ba: 60, // 640沿台西跳(v~40-70)→越x416墙(顶576)→落塔顶(352-416,576)
  fW5: [560, 578],       // 塔顶/平台连续西行(走离x352落b11帽顶/平台736)→x~260
  fJ5: 579, fJ5a: 60,    // (预留, 现于塔壁滑落途中无害)
  fJ7: 805, fJ7a: 20, // (备而不用) // 平台x268.7西跳(v~110)→飞越绿池槽→落地面x~89(fb门内)
  fW7: [790, 832], fW7b: [840, 1080],      // 平台西行穿绿池顶(736,传感器带741.8够不到)→走离x160→落地面→fb门
  // WG（东侧）
  gW1a: [2, 50],         // 东行上双坡→hump顶西段
  gW1b: [60, 66],        // 顶东微蓄速v~30
  gJ1: 68, gJ1a: 55,     // 东跳(v~30)越下降楔→落主板上部x~1030-1060
  gW2a: [140, 178],      // 板上西行冲刺→滑行停x~1011(spawn板西缘台阶前)
  gJ2: 205, gJ2a: 30,    // 西小跳越过x1008台阶→落主板平段x~935
  gW2b: [240, 360],      // 8/8西脉冲: 行板+爬上坡(832→800抬升32px)→崖缘v~65走离→柱坡(768,544)-(800,576)滑入池西端
  gW2c9: [400, 406],     // 6f西按蓄速v~49→x~850平段
  gJ5: 407, gJ5a: 40,    // 平段全力西跳→落柱坡(768-800,544-576)→滑入池
  gJ3: 745, gJ3a: 30,    // 西坡顶小跳32px→柱顶(768-800,608)
  gW3a2: [575, 660],     // 涉水东行8/8→银钻(852-875)采集→
  gW3b: [670, 735],      // 涉水西行8/8→返西坡(800,640)-(841.6,656)
  gW3c: [755, 795],      // 柱顶西行8/8→走离x768→坡(768,640)-(736,672)→块y672→缘x736
  gW3d: [800, 820],      // 连续西按→走离块缘→竖井落地面段(608-800,864)
  gJ4: 905, gJ4a: 50,    // 跳上柱(544-576,顶800)
  gW4: [830, 900],       // 地面段西行→柱(544-576)前
    gW5: [1060, 1180],     // 地面西行→wg门(192-256)
};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([a-zA-Z0-9]+)=(.+)$/);
  if (m && m[1] in P) {
    const v = m[2];
    P[m[1]] = v.includes(",") ? v.split(",").map(Number) : Number(v);
  }
}
const TOTAL = 1800;
const fb = [], wg = [];
const hold = (a, f1, f2, d) => { if (f2 > f1) { a.push({ f: f1, dir: d, type: "down" }); a.push({ f: f2, dir: d, type: "up" }); } };
const jmp = (a, f, d, air) => { a.push({ f, dir: "up", type: "down" }); a.push({ f: f + (air ?? 55), dir: "up", type: "up" }); if (d) { a.push({ f, dir: d, type: "down" }); a.push({ f: f + (air ?? 55), dir: d, type: "up" }); } };
// 脉冲行走: on帧按下 off帧松开, 循环到f1
const pulse = (a, f0, f1, d, on = 4, off = 6) => {
  let f = f0;
  while (f + on < f1) { hold(a, f, f + on, d); f += on + off; }
  if (f < f1) hold(a, f, f1, d);
};
{
  const p = P;
  hold(fb, 2, p.fA1 - 1, "left"); jmp(fb, p.fA1, "left");
  hold(fb, p.fA1 + 90, p.fA2 - 1, "left"); jmp(fb, p.fA2, "left");
  hold(fb, p.fW2a, p.fW2b, "right"); jmp(fb, p.fJ2, "right");
  hold(fb, p.fW3a, p.fJ3 - 1, "right"); jmp(fb, p.fJ3, "right");
  hold(fb, p.fW4[0], p.fW4[1], "left");
  hold(fb, p.fJ4bh[0], p.fJ4bh[1], "left"); jmp(fb, p.fJ4b, "left", p.fJ4ba);
  hold(fb, p.fW5[0], p.fW5[1], "left"); jmp(fb, p.fJ5, "left", p.fJ5a);
  jmp(fb, p.fJ7, "left", p.fJ7a);
  hold(fb, p.fW7[0], p.fW7[1], "left");
  hold(fb, p.fW7b[0], p.fW7b[1], "right");
}
{
  const p = P;
  hold(wg, p.gW1a[0], p.gW1a[1], "right");
  pulse(wg, p.gW1b[0], p.gW1b[1], "right", 4, 8);
  jmp(wg, p.gJ1, "right", p.gJ1a);
  hold(wg, p.gW2a[0], p.gW2a[1], "left");
  jmp(wg, p.gJ2, "left", p.gJ2a);
  pulse(wg, p.gW2b[0], p.gW2b[1], "left", 8, 8);
  hold(wg, p.gW2c9[0], p.gW2c9[1], "left");
  jmp(wg, p.gJ5, "left", p.gJ5a);
  pulse(wg, p.gW3a2[0], p.gW3a2[1], "right", 8, 8);

  jmp(wg, p.gJ3, "left", p.gJ3a);
  hold(wg, p.gW3c[0], p.gW3c[1], "left");
  pulse(wg, p.gW4[0], p.gW4[1], "left", 8, 8);
  jmp(wg, p.gJ4, "left", p.gJ4a);
  hold(wg, p.gW5[0], p.gW5[1], "left");
}

const w = makeWorld("forest_29");
const expand = (events) => {
  const st = { left: false, right: false, up: false };
  const byF = new Map();
  for (const e of events) { if (!byF.has(e.f)) byF.set(e.f, []); byF.get(e.f).push(e); }
  const frames = [];
  for (let f = 0; f < TOTAL; f++) {
    for (const e of byF.get(f) ?? []) st[e.dir] = e.type === "down";
    frames.push({ fireboy: { ...st }, watergirl: { ...st } });
  }
  return frames;
};
const F = expand(fb), G = expand(wg);
const trace = [];
let endF = -1, dead = "", won = false;
for (let f = 0; f < TOTAL; f++) {
  w.step(1 / 60, { fireboy: F[f].fireboy, watergirl: G[f].watergirl });
  const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
  trace.push({ f, fb: [+fbS.x.toFixed(1), +fbS.y.toFixed(1)], wg: [+wgS.x.toFixed(1), +wgS.y.toFixed(1)] });
  if (fbS.dead || wgS.dead) { dead = fbS.dead ? "fb" : "wg"; endF = f; break; }
  if (w.phase === "won") { won = true; endF = f; break; }
}
console.log(`result: ${dead ? dead + " DEAD" : won ? "WIN" : "TIMEOUT"} @f${endF}`);
if (process.argv.includes("--trace")) writeFileSync(process.argv[process.argv.indexOf("--trace") + 1], JSON.stringify({ endF, dead, trace }));
// 分段检查点
const marks = [P.fJ3 + 30, P.fJ3 + 40, P.fW4[1], P.fW4[1] + 40, P.fW4[1] + 45, P.fJ4bh[0] - 2, P.fJ4b, P.fJ4b + 20, P.fJ4b + 40, P.fJ4b + 62, P.fJ4b + 90, P.fW5[0] - 2, P.fW5[1] - 5, P.fJ5, P.fJ5 + 30, P.fJ5 + 62, P.fJ5 + 75, P.fJ5 + 90, P.fW7[0], P.fW7[1],
  P.gW1a[1], P.gJ1, P.gJ1 + 62, P.gW2a[1], P.gJ2, P.gJ2 + 40, P.gW2b[1], P.gW2b[1] + 40, P.gW2c9[0], P.gW2c9[1], P.gJ5, P.gJ5 + 40, P.gJ5 + 70, P.gW3a2[1], P.gW3b[1], P.gJ3, P.gJ3 + 35, P.gW3c[1], P.gW3d[1], P.gW3d[1] + 50, P.gW4[0], P.gJ4, P.gJ4 + 40, P.gW4[1], P.gW5[1], P.gW5[1] + 40];
marks.sort((a, b) => a - b);
let prev = -1;
const lines = [];
for (const m of marks) {
  if (m <= prev || m >= trace.length) continue;
  prev = m;
  const t = trace[m];
  lines.push(`f${m} fb(${t.fb[0]},${t.fb[1]}) wg(${t.wg[0]},${t.wg[1]})`);
}
console.log(lines.join("\n"));

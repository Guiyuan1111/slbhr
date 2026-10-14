// build3.mjs — forest_29 路线构建器 v4（地形带校正后全重排）
// 用法: node --import tsx build3.mjs [--trace out.json] [K=V ...]
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const P = {
  // FB（西侧）
  fA1: 24,               // 板缘跳→池西北角
  fA2: 124,              // 角跳→直落西板y384
  fW2a: 320, fW2b: 336, fJ2: 342, // 西板东行→跳W2水槽→盖板(224-320,384)
  fW3a: 400, fJ3: 423,   // 盖板东行→跳→杠杆台西端(落x~444)
  fJ4h: [482, 489], fJ4: 490, fJ4a: 60, // 蓄速右跳: 越杠杆臂+越台缘x544→井口→板2
  fW4: [600, 675],       // 板2脉冲西行→下45°斜坡(448,768)-(480,736)→ledge平段
  fJ4bh: [700, 706], fJ4b: 707, fJ4ba: 55, // ledge x~445起跳西(v~40)→越x416-448三角→B柱hyp/顶
  fW5: [740, 800],       // B柱顶脉冲西行→走离x384→b10坡→推杆顶(336-368,876.8)
  fJ5: 812, fJ5w: 2,     // 推杆顶微蓄速(v~15)西跳→柱A顶(288-320,768)
  fJ5b: [880, 980],      // 柱A西行走离→地板y896→西行进fb门
  fW7: [990, 1100],      // 地面西行→fb门(64-128)
  // WG（东侧）
  gW1a: [2, 50],         // 东行上双坡→hump顶西段
  gW1b: [60, 66],        // 顶东微蓄速v~30
  gJ1: 68, gJ1a: 55,     // 东跳(v~30)越下降楔→落主板上部x~1030-1060
  gW2a: [150, 180],      // 主板东行→x~1121滑行
  gW2b: [190, 194],      // 短按东行→x~1140
  gW2c: [208, 212],      // 短按东行→x~1147
  gW2c2: [222, 225],     // 短按东行→出东缘x1152(v~30)→落东柱顶y640 x~1169
  gW2d: [300, 304],      // 柱顶西向蓄速v~30
  gJ2: 306, gJ2a: 30,    // 西跳→板底削顶盖板滑行(v_c~64)→出x832→落池西坡x~806
  gW3a: [660, 740],      // 涉水东行脉冲(吃银钻852-875)
  gW3b: [745, 825],      // 涉水西行脉冲→出西坡(800,640)→柱顶y640
  gW3c: [830, 866],      // 脉冲西行→坡(768,640)-(736,672)→块y672顶
  gW3d: [868, 880],      // 连续西按12f→离x736缘(v~100)→井腔→块y832 x~660
  gW4: [950, 1025],      // 块y832脉冲西行→x608缘→落地y896 x~590
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
  hold(fb, p.fJ4h[0], p.fJ4h[1], "right"); jmp(fb, p.fJ4, "right", p.fJ4a);
  pulse(fb, p.fW4[0], p.fW4[1], "left", 8, 8);
  hold(fb, p.fJ4bh[0], p.fJ4bh[1], "left"); jmp(fb, p.fJ4b, "left", p.fJ4ba);
  pulse(fb, p.fW5[0], p.fW5[1], "left", 8, 8);
  hold(fb, p.fJ5 - p.fJ5w, p.fJ5 - 1, "left"); jmp(fb, p.fJ5, "left", 70);
  hold(fb, p.fJ5b[0], p.fJ5b[1], "left");
  hold(fb, p.fW7[0], p.fW7[1], "left");
}
{
  const p = P;
  hold(wg, p.gW1a[0], p.gW1a[1], "right");
  pulse(wg, p.gW1b[0], p.gW1b[1], "right", 4, 8);
  jmp(wg, p.gJ1, "right", p.gJ1a);
  hold(wg, p.gW2a[0], p.gW2a[1], "right");
  hold(wg, p.gW2b[0], p.gW2b[1], "right");
  hold(wg, p.gW2c[0], p.gW2c[1], "right");
  hold(wg, p.gW2c2[0], p.gW2c2[1], "right");
  hold(wg, p.gW2d[0], p.gW2d[1], "left");
  jmp(wg, p.gJ2, "left", p.gJ2a);
  pulse(wg, p.gW3a[0], p.gW3a[1], "right", 8, 8);
  pulse(wg, p.gW3b[0], p.gW3b[1], "left", 8, 8);
  pulse(wg, p.gW3c[0], p.gW3c[1], "left", 8, 8);
  hold(wg, p.gW3d[0], p.gW3d[1], "left");
  pulse(wg, p.gW4[0], p.gW4[1], "left", 8, 8);
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
const marks = [P.fA2 + 90, P.fJ2 + 56, P.fJ3 + 62, P.fJ4, P.fJ4 + 62, P.fJ4 + 110, P.fW4[0] + 35, P.fW4[1], P.fJ4bh[0], P.fJ4b, P.fJ4b + 30, P.fJ4b + 62, P.fJ4b + 90, P.fW5[1], P.fW5[1] + 25, P.fJ5, P.fJ5 + 30, P.fJ5 + 71, P.fJ5 + 110, P.fJ5b[0] + 25, P.fJ5b[1], P.fJ5b[1] + 30, P.fW7[0], P.fW7[1],
  P.gW1a[1], P.gJ1, P.gJ1 + 62, P.gJ1 + 100, P.gW2a[1], P.gW2b[1], P.gW2c[1], P.gW2c2[0] - 2, P.gW2c2[1], P.gW2c2[1] + 25, P.gW2c2[1] + 60, P.gJ2, P.gJ2 + 80, P.gJ2 + 200, P.gJ2 + 300, P.gJ2 + 345, P.gW3a[1], P.gW3b[1], P.gW3c[1], P.gW3d[1], P.gW3d[1] + 45, P.gW4[1], P.gW4[1] + 30, P.gW5[1], P.gW5[1] + 30];
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

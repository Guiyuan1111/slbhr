// rb36.mjs — forest_29 路线构建器 v36（r29c 西漏斗重构：fb 门柱两段式 + wg 西瀑布直落）
// 用法: node --import tsx rb36.mjs [--trace out.json] [--marks] [K=V ...]
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const P = {
  // ===== FB（西侧，r29b fA1/fA2 开局沿用：f205 落西帽 x0-128 顶384 @54.9,348.5）=====
  fA1: 24,               // 板缘跳→池西北角
  fA2: 124,              // 角跳→直落西板y384
  fWe: [214, 238],       // 西帽东行(慢接近缘) → f238 停(惯性~5-10px → 中心~120)
  fTe: [248, 249],       // 2f 轻点东 → 走出帽缘 → 15f 落 32px 上 c4 柱顶(y416,x128-160)
  fTw: [268, 270],       // 3f 轻点西 → 走出柱顶西缘 → 480px 走廊坠落贴 x128 面
  fWd: [350, 368],       // 落地(中心~860) 东行回门心 x96
  // ===== WG（东侧，西漏斗瀑布）=====
  gWw: [2, 16],          // 出生西行(864→~838)
  gJ1: 17, gJ1a: 70,     // 西跳越 stall 斜坡 → 落柱顶(y416,x768-800)或西"/"坡
  gWc: [120, 152],       // 瀑布续西(下坡链自滑) —— 到 (576,576) 走离坠井
  gWp: [175, 195],       // 板2西行(704.8) → 走离西端(x516.8)
  gWc2: [215, 240],      // c15 顶(y768) 西行 → c12"/"坡降(384,800)
  gWs: [255, 262],       // 走离 x384 → 竖井 x352-384 坠底板
  gWd: [300, 330],       // 底板西行 → wg 门(x192-256) 站门
};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([a-zA-Z0-9]+)=(.+)$/);
  if (m && m[1] in P) {
    const v = m[2];
    P[m[1]] = v.includes(",") ? v.split(",").map(Number) : Number(v);
  }
}
const TOTAL = 900;
const fb = [], wg = [];
const hold = (a, f1, f2, d) => { if (f2 > f1) { a.push({ f: f1, dir: d, type: "down" }); a.push({ f: f2, dir: d, type: "up" }); } };
const jmp = (a, f, d, air) => { a.push({ f, dir: "up", type: "down" }); a.push({ f: f + (air ?? 55), dir: "up", type: "up" }); if (d) { a.push({ f, dir: d, type: "down" }); a.push({ f: f + (air ?? 55), dir: d, type: "up" }); } };
const pulse = (a, f0, f1, d, on = 4, off = 6) => {
  let f = f0;
  while (f + on < f1) { hold(a, f, f + on, d); f += on + off; }
  if (f < f1) hold(a, f, f1, d);
};
{
  const p = P;
  hold(fb, 2, p.fA1 - 1, "left"); jmp(fb, p.fA1, "left");
  hold(fb, p.fA1 + 90, p.fA2 - 1, "left"); jmp(fb, p.fA2, "left");
  hold(fb, p.fWe[0], p.fWe[1], "right");       // 东行接近帽缘
  hold(fb, p.fTe[0], p.fTe[1], "right");       // 轻点走出缘
  hold(fb, p.fTw[0], p.fTw[1], "left");        // 轻点西走出柱顶
  hold(fb, p.fWd[0], p.fWd[1], "right");       // 落地东行回门心
}
{
  const p = P;
  hold(wg, p.gWw[0], p.gWw[1], "left");
  jmp(wg, p.gJ1, "left", p.gJ1a);
  pulse(wg, p.gWc[0], p.gWc[1], "left", 4, 4);
  pulse(wg, p.gWp[0], p.gWp[1], "left", 4, 4);
  pulse(wg, p.gWc2[0], p.gWc2[1], "left", 4, 4);
  hold(wg, p.gWs[0], p.gWs[1], "left");
  hold(wg, p.gWd[0], p.gWd[1], "left");
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
// 检查点
const marks = [
  P.fA1, P.fA2 + 40, P.fWe[1], P.fWe[1] + 12, P.fTe[1], P.fTe[1] + 18, P.fTw[1], P.fTw[1] + 20, P.fTw[1] + 45, P.fTw[1] + 62, P.fWd[0], P.fWd[1],
  P.gWw[1], P.gJ1, P.gJ1 + 30, P.gJ1 + 60, P.gJ1 + 90, P.gJ1 + 120, P.gWc[0], P.gWc[1], P.gWc[1] + 25, P.gWp[0], P.gWp[1], P.gWp[1] + 20,
  P.gWc2[0], P.gWc2[1], P.gWs[1], P.gWs[1] + 40, P.gWd[0], P.gWd[1], P.gWd[1] + 60,
];
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

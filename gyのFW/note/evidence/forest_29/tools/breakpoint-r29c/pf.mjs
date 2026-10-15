// pf.mjs — fb 全路线验证（复活 v35 主干 + 修复尾部：门内站位，不再东行送死）
// 用法: node --import tsx pf.mjs [K=V ...] [--trace out.json]
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const P = {
  fA1: 24,               // 板缘跳→W1池西北角(西岸224-256,y224) f~85
  fA2: 124,              // 角跳→西盖板(cap 0-128,y384) f205
  fW2a: 320, fW2b: 336, fJ2: 342, // 盖板东行→跳W2水槽→矩形盖(224-320,384)
  fW3a: 400, fJ3: 423,   // 矩形盖东行→跳→杠杆平台(x~440,y416)
  fW4: [456, 474],       // 平台落地左键减速→西行走离x416缘(~422)→松键直落箱顶(388)
  fBoxJ: 509, fBoxJa: 20, // 箱顶西跳(短握20f)→回落箱顶中段(346.5)
  fB12W: [578, 580],     // (无走动,箱顶静止起跳)
  fJ7: 602, fJ7a: 60,    // 箱顶二段西跳(静起)→落b12(~291)
  fW8: [715, 725],       // b12西行(291→~265 cruise)
  fJ8: 726, fJ8a: 60,    // b12全速西跳(升124.2)→越c4墙顶(y608)→落柱顶窗/走廊
  fStand: 845,           // 全松门内站~50f+
};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([a-zA-Z0-9]+)=(.+)$/);
  if (m && m[1] in P && !a.startsWith("--")) {
    P[m[1]] = m[2].includes(",") ? m[2].split(",").map(Number) : Number(m[2]);
  }
}
const TOTAL = 1150;
const fb = [], wg = [];
const hold = (a, f1, f2, d) => { if (f2 > f1) { a.push({ f: f1, dir: d, type: "down" }); a.push({ f: f2, dir: d, type: "up" }); } };
const jmp = (a, f, d, air) => { a.push({ f, dir: "up", type: "down" }); a.push({ f: f + (air ?? 55), dir: "up", type: "up" }); if (d) { a.push({ f, dir: d, type: "down" }); a.push({ f: f + (air ?? 55), dir: d, type: "up" }); } };
{
  const p = P;
  hold(fb, 2, p.fA1 - 1, "left"); jmp(fb, p.fA1, "left");
  hold(fb, p.fA1 + 90, p.fA2 - 1, "left"); jmp(fb, p.fA2, "left");
  hold(fb, p.fW2a, p.fW2b, "right"); jmp(fb, p.fJ2, "right");
  hold(fb, p.fW3a, p.fJ3 - 1, "right"); jmp(fb, p.fJ3, "right");
  hold(fb, p.fW4[0], p.fW4[1], "left");
  jmp(fb, p.fBoxJ, "left", p.fBoxJa);
  hold(fb, p.fB12W[0], p.fB12W[1], "left");
  jmp(fb, p.fJ7, "left", p.fJ7a);
  hold(fb, p.fW8[0], p.fW8[1], "left");
  jmp(fb, p.fJ8, "left", p.fJ8a);
}

const w = makeWorld("forest_29");
const expand = (events) => {
  const st = { left: false, right: false, up: false };
  const byF = new Map();
  for (const e of events) { if (!byF.has(e.f)) byF.set(e.f, []); byF.get(e.f).push(e); }
  const frames = [];
  for (let f = 0; f < TOTAL; f++) {
    for (const e of byF.get(f) ?? []) st[e.dir] = e.type === "down";
    frames.push({ ...st });
  }
  return frames;
};
const F = expand(fb);
const trace = [];
let endF = -1, dead = "", won = false;
for (let f = 0; f < TOTAL; f++) {
  w.step(1 / 60, { fireboy: F[f], watergirl: { left: false, right: false, up: false } });
  const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
  trace.push({ f, fb: [+fbS.x.toFixed(1), +fbS.y.toFixed(1)], wg: [+wgS.x.toFixed(1), +wgS.y.toFixed(1)] });
  if (fbS.dead || wgS.dead) { dead = fbS.dead ? "fb" : "wg"; endF = f; break; }
  if (w.phase === "won") { won = true; endF = f; break; }
}
console.log(`result: ${dead ? dead + " DEAD" : won ? "WIN" : "TIMEOUT"} @f${endF}`);
if (process.argv.includes("--trace")) writeFileSync(process.argv[process.argv.indexOf("--trace") + 1], JSON.stringify({ endF, dead, trace }));
const marks = [P.fA1, 40, 60, 80, P.fA2, P.fA2 + 40, P.fA2 + 81, P.fW2a, P.fW2b, P.fJ2, P.fJ2 + 30, P.fJ2 + 58, P.fW3a, P.fJ3, P.fJ3 + 30, P.fJ3 + 60, P.fW4[0], P.fW4[1], 500, 518, 540, 560, 580, P.fJ7, P.fJ7 + 35, P.fJ7 + 70, P.fJ7 + 98, P.fW8[0], P.fW8[1], P.fJ8, P.fJ8 + 35, P.fJ8 + 50, P.fJ8 + 70, P.fJ8 + 85, P.fStand, P.fStand + 60, P.fStand + 120];
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

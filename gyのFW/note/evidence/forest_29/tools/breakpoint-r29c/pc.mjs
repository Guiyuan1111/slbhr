// pc.mjs — wg 全程 v2（东跳越坡→东缘慢出→柱梯→L1跳→c15→c10/c9→门）参数扫描
// 用法: node --import tsx pc.mjs [K=V ...]
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const P = {
  gWe: 14, gJe: 16, gJea: 55,   // 东行加速 + 东跳(越"/"坡) 上 y448 平台
  gW1a: 20, gW1b: 62,           // y448 平台东行(下坡加速)
  gW1c: 62, gW1d: 76,           // 松键滑行(缘前减速)
  gT1: 78, gT1n: 2,             // 缘前东点(走出缘)
  gW2a: 96, gW2b: 130,          // A(或B)上西行
  gW3a: 150, gW3b: 185,         // 西行续(B→C)
  gJ4: 205, gJ4a: 30,           // C缘西跳 → D(x960-1024,y768)
  gW5a: 230, gW5b: 300,         // D西行走离级联(960→928→896→岸)
  gJ6: 330, gJ6a: 18,           // 岸上短跳西越L1 → 西岸
  gW7a: 360, gW7b: 385,         // 西岸西行走离x768 → 井坑落地
  gW8a: 400, gW8b: 425,         // 地板西行→x672块
  gJ8: 428, gJ8a: 50,           // 跳上块(或飞入槽)
  gW9a: 450, gW9b: 492,         // 块顶西行→走出缘→板2
  gW9c: 500, gW9d: 528,         // 板2西行→走出西端
  gJ9: 532, gJ9a: 55,           // c15 上西跳 → c10/c9
  gWa: 600, gWb: 640,           // 西行下地板→门
};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^([a-zA-Z0-9]+)=(.+)$/);
  if (m && m[1] in P) P[m[1]] = v2n(m[2]);
}
function v2n(v) { return v.includes(",") ? v.split(",").map(Number) : Number(v); }

const evs = [];
const hold = (f1, f2, d) => { if (f2 > f1) evs.push({ f: f1, dir: d, type: "down" }, { f: f2, dir: d, type: "up" }); };
const jmp = (f, d, air) => { evs.push({ f, dir: "up", type: "down" }, { f: f + air, dir: "up", type: "up" }); if (d) evs.push({ f, dir: d, type: "down" }, { f: f + air, dir: d, type: "up" }); };
const p = P;
hold(2, p.gWe, "right"); jmp(p.gJe, "right", p.gJea);
hold(p.gW1a, p.gW1b, "right");
hold(p.gW1c, p.gW1d, "right");
hold(p.gT1, p.gT1 + p.gT1n, "right");
hold(p.gW2a, p.gW2b, "left");
hold(p.gW3a, p.gW3b, "left");
jmp(p.gJ4, "left", p.gJ4a);
hold(p.gW5a, p.gW5b, "left");
jmp(p.gJ6, "left", p.gJ6a);
hold(p.gW7a, p.gW7b, "left");
hold(p.gW8a, p.gW8b, "left");
jmp(p.gJ8, "left", p.gJ8a);
hold(p.gW9a, p.gW9b, "left");
hold(p.gW9c, p.gW9d, "left");
jmp(p.gJ9, "left", p.gJ9a);
hold(p.gWa, p.gWb, "left");

const st = { left: false, right: false, up: false };
const byF = new Map();
for (const e of evs) { if (!byF.has(e.f)) byF.set(e.f, []); byF.get(e.f).push(e); }
const w = makeWorld("forest_29");
const pts = [];
let out = "", endF = -1;
for (let f = 0; f < 900; f++) {
  for (const e of byF.get(f) ?? []) st[e.dir] = e.type === "down";
  w.step(1 / 60, { fireboy: st, watergirl: { ...st } });
  const s = w.snapshotPlayer("watergirl");
  pts.push([+s.x.toFixed(1), +s.y.toFixed(1)]);
  if (s.dead) { out = `DEAD@f${f}`; endF = f; break; }
  if (w.phase === "won") { out = `WIN@f${f}`; endF = f; break; }
}
const marks = [p.gJe + 30, p.gW1b, p.gW1d, p.gT1 + 6, p.gT1 + 20, p.gT1 + 38, p.gW2b, p.gW2b + 30, p.gW3b, p.gJ4 + 20, p.gJ4 + 45, p.gJ4 + 75, p.gW5b, p.gW5b + 25, p.gW5b + 55, p.gJ6 + 15, p.gJ6 + 35, p.gJ6 + 60, p.gW7b, p.gW8b, p.gJ8 + 25, p.gJ8 + 55, p.gW9b, p.gW9b + 25, p.gW9d, p.gW9d + 20, p.gJ9 + 25, p.gJ9 + 55, p.gWa, p.gWb, p.gWb + 50, p.gWb + 100].filter(f => f < pts.length);
console.log(`wg: ${out || "TIMEOUT"}  ${marks.map(i => `f${i}(${pts[i]})`).join(" ")}`);

/**
 * r29b 探针4：
 *  WG: 东行上 r14 台阶(顶y448) → 台顶西跳越 x800 柱面 → 落西侧阶梯链 (mass 512 / wD 544)
 *  FB: 东出台缘(608)落袋腔底(288) → 西走出落杠杆台(416)
 */
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

function run(name, side, evs, total = 300, logEvery = 5) {
  const st = { up: false, left: false, right: false };
  const byF = new Map();
  for (const e of evs) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
  const ins = [];
  for (let f = 0; f < total; f++) {
    for (const [k, v] of byF.get(f) ?? []) st[k] = v;
    ins.push({ ...st });
  }
  const w = makeWorld("forest_29");
  const idle = { up: false, left: false, right: false };
  const trace = [];
  let death = -1;
  for (let f = 0; f < total; f++) {
    const inp = side === "wg" ? { fireboy: idle, watergirl: ins[f] } : { fireboy: ins[f], watergirl: idle };
    w.step(1 / 60, inp);
    const p = w.snapshotPlayer(side === "wg" ? "watergirl" : "fireboy");
    trace.push({ f, x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
    if (p.dead || p.dying) { death = f; break; }
  }
  console.log(`\n=== ${name} === death@${death} end=(${trace.at(-1).x},${trace.at(-1).y})`);
  let line = [];
  for (const t of trace) {
    if (t.f % logEvery === 0) line.push(`f${t.f}(${t.x},${t.y})`);
    if (line.length === 8) { console.log(line.join(" ")); line = []; }
  }
  if (line.length) console.log(line.join(" "));
  return trace;
}

// W1: wg 东行上台阶（f10 起按右 45f），到台阶顶停下
run("W1 wg east onto r14 step", "wg", [
  { f: 10, dir: "right", type: "down" },
  { f: 55, dir: "right", type: "up" },
]);

// W2: W1 后台阶顶(f85?) 西跳越柱面——跳起按西 15f 松开
run("W2 step-top jump west", "wg", [
  { f: 10, dir: "right", type: "down" },
  { f: 55, dir: "right", type: "up" },
  { f: 85, dir: "up", type: "down" },
  { f: 86, dir: "up", type: "up" },
  { f: 86, dir: "left", type: "down" },
  { f: 100, dir: "left", type: "up" },
]);

// W3: 同 W2 但按西到 f95
run("W3 step-top jump west longer", "wg", [
  { f: 10, dir: "right", type: "down" },
  { f: 55, dir: "right", type: "up" },
  { f: 85, dir: "up", type: "down" },
  { f: 86, dir: "up", type: "up" },
  { f: 86, dir: "left", type: "down" },
  { f: 95, dir: "left", type: "up" },
]);

// F1: fb 东出台缘落袋腔底
run("F1 fb east off plate", "fb", [
  { f: 10, dir: "right", type: "down" },
]);

// F2: fb 落袋腔底后西走出落杠杆台
run("F2 fb pocket->lever platform", "fb", [
  { f: 10, dir: "right", type: "down" },
  { f: 45, dir: "right", type: "up" },
  { f: 90, dir: "left", type: "down" },
]);

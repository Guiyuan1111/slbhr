/**
 * r29b 探针3：wg 卡态跳+西按 → 飞越 x800 柱面落西侧阶梯链
 * 目标落点：r16 大块顶 (x640-736, y512) 或 wD (x608-640, y544)
 */
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const TOTAL = 300;

function run(name, wgEvs, logEvery = 5) {
  const st = { up: false, left: false, right: false };
  const byF = new Map();
  for (const e of wgEvs) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
  const ins = [];
  for (let f = 0; f < TOTAL; f++) {
    for (const [k, v] of byF.get(f) ?? []) st[k] = v;
    ins.push({ ...st });
  }
  const w = makeWorld("forest_29");
  const trace = [];
  let death = -1;
  for (let f = 0; f < TOTAL; f++) {
    w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: ins[f] });
    const wg = w.snapshotPlayer("watergirl");
    trace.push({ f, x: +wg.x.toFixed(1), y: +wg.y.toFixed(1) });
    if (wg.dead || wg.dying) { death = f; break; }
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

// C: 卡态跳(f70)全程按西
run("C stall-jump hold-left", [
  { f: 10, dir: "left", type: "down" },
  { f: 70, dir: "up", type: "down" },
  { f: 71, dir: "up", type: "up" },
]);

// D: 卡态跳(f70)按西至f85松开（漂移截半）
run("D stall-jump left f70-85", [
  { f: 10, dir: "left", type: "down" },
  { f: 70, dir: "up", type: "down" },
  { f: 71, dir: "up", type: "up" },
  { f: 85, dir: "left", type: "up" },
]);

// E: 卡态跳(f70)按西至f80松开
run("E stall-jump left f70-80", [
  { f: 10, dir: "left", type: "down" },
  { f: 70, dir: "up", type: "down" },
  { f: 71, dir: "up", type: "up" },
  { f: 80, dir: "left", type: "up" },
]);

/**
 * r29b 探针2：wg 斜坡卡态处理 + 斜坡顶起跳西跃（→y384柱顶 / 斜梯链）
 */
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const TOTAL = 400;

function run(name, wgEvs, logEvery = 0, marks = []) {
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
  if (logEvery) {
    let line = [];
    for (const t of trace) {
      if (t.f % logEvery === 0) line.push(`f${t.f}(${t.x},${t.y})`);
      if (line.length === 8) { console.log(line.join(" ")); line = []; }
    }
    if (line.length) console.log(line.join(" "));
  }
  for (const m of marks) {
    const seg = trace.filter(t => t.f >= m[0] && t.f <= m[1]);
    console.log(`  mark[${m[0]}-${m[1]}]:`, seg.map(t => `f${t.f}(${t.x},${t.y})`).join(" "));
  }
  return trace;
}

// A: 卡态处理——松开左再按左，能否继续上坡到顶角 (800,448)
run("A stall: release L f50, re-L f55", [
  { f: 10, dir: "left", type: "down" },
  { f: 50, dir: "left", type: "up" },
  { f: 55, dir: "left", type: "down" },
], 10);

// B: 跳过卡态——按住左直接起跳(上)看是否触发
run("B stall: jump while stalled", [
  { f: 10, dir: "left", type: "down" },
  { f: 70, dir: "up", type: "down" },
  { f: 71, dir: "up", type: "up" },
], 10);

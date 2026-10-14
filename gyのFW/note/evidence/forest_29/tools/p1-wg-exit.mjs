/**
 * r29b 探针1：wg 井降→水池W3→涉水→出池跳（fb 原地不动）
 * 用法: node --import tsx TEMP/r29b/p1-wg-exit.mjs
 */
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const TOTAL = 420;

function run(name, wgEvs, fbEvs = []) {
  const st = { up: false, left: false, right: false };
  const mk = (evs) => {
    const s = { up: false, left: false, right: false };
    const byF = new Map();
    for (const e of evs) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
    const out = [];
    for (let f = 0; f < TOTAL; f++) {
      for (const [k, v] of byF.get(f) ?? []) s[k] = v;
      out.push({ ...s });
    }
    return out;
  };
  const ins_wg = mk(wgEvs), ins_fb = mk(fbEvs);
  const w = makeWorld("forest_29");
  const trace = [];
  let death = -1;
  for (let f = 0; f < TOTAL; f++) {
    w.step(1 / 60, { fireboy: ins_fb[f], watergirl: ins_wg[f] });
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    trace.push({ f, fb: [+fb.x.toFixed(1), +fb.y.toFixed(1)], wg: [+wg.x.toFixed(1), +wg.y.toFixed(1)], ph: w.phase });
    if (fb.dead || wg.dead || fb.dying || wg.dying) { death = f; break; }
  }
  const tail = trace.slice(-6);
  const minYwg = Math.min(...trace.map(t => t.wg[1]));
  console.log(`\n=== ${name} === death@${death}`);
  console.log("tail:", tail.map(t => `f${t.f} wg(${t.wg})`).join("  "));
  // 打印关键事件帧附近
  return trace;
}

// S1: wg 走西出板，落入井
run("S1 wg west off board f10", [
  { f: 10, dir: "left", type: "down" },
]);

// S2: S1 + 下落中段按 east (右) 看横向控制
run("S2 wg west f10, right f40-f56", [
  { f: 10, dir: "left", type: "down" },
  { f: 40, dir: "left", type: "up" },
  { f: 40, dir: "right", type: "down" },
  { f: 56, dir: "right", type: "up" },
]);

// S3: S1 落水后向右涉水 90f（试 silver 拾取），再向左 90f
run("S3 wg wade east 90f then west", [
  { f: 10, dir: "left", type: "down" },
  { f: 70, dir: "left", type: "up" },
  { f: 75, dir: "right", type: "down" },
  { f: 165, dir: "right", type: "up" },
  { f: 170, dir: "left", type: "down" },
  { f: 260, dir: "left", type: "up" },
]);

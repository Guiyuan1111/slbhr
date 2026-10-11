// forest_12_1 探针 harness：分段输入回放 + 状态采样（诊断用，非最终路线）
import { makeWorld, expandFlat } from "../../scripts/e2e/routetool/kernel.mjs";

export function ev(f, dir, type) { return { f, dir, type }; }
export function hold(dir, f0, f1) { return [ev(f0, dir, "down"), ev(f1, dir, "up")]; }

/** 跑一段：返回 {trace, world 结束态, diamonds 收集表}；trace[f]={fb,wg} */
export function runSeg(level, fbEvs, wgEvs, frames) {
  const ins = expandFlat(fbEvs, wgEvs, frames);
  const w = makeWorld(level);
  const trace = [];
  const evs = [];
  for (let f = 0; f < frames; f++) {
    const stepEvents = w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    for (const e of stepEvents) if (e.type === "diamond" || e.type === "death" || e.type === "win") evs.push({ f, ...e });
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    const hang = w.mechSnapshot().hangings;
    trace.push({ f, fb: [fb.x, fb.y], wg: [wg.x, wg.y], hang, doors: { fb: w.built.doors.fireboy.isOpen, wg: w.built.doors.watergirl.isOpen } });
    if (fb.dead || wg.dead || fb.dying || wg.dying) break;
  }
  const collected = w.built.diamonds.filter(d => d.collected).map(d => `${d.kind[0]}(${d.x},${d.y})`);
  return { trace, evs, collected, world: w };
}

/** 打印某角色的位置序列（每 k 帧），可标注事件帧 */
export function dump(trace, who, k = 5, from = 0, to = trace.length) {
  const lines = [];
  for (let i = from; i < Math.min(to, trace.length); i += k) {
    const t = trace[i];
    const [x, y] = t[who];
    const h = t.hang.map(h => `${h.id}:(${h.x.toFixed(0)},${h.y.toFixed(0)},${(h.angle * 180 / Math.PI).toFixed(0)}°)`).join(" ");
    lines.push(`f${String(t.f).padStart(4)} ${who}=(${x.toFixed(1)},${y.toFixed(1)})  hang ${h}${t.doors.fb ? " [fbDoor]" : ""}${t.doors.wg ? " [wgDoor]" : ""}`);
  }
  return lines.join("\n");
}

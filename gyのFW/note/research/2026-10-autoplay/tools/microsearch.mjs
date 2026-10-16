// auto 调研槽·微型端到端验证：原语序列 beam search（内核 = 目标函数）
// 目标：forest_01 双角色从出生点出发，机器自搜出"向各自门推进"的原语序列（Demo 级，非通关）。
// 用法: cd gyのFW && node --import tsx TEMP/auto/microsearch.mjs [--beam 24] [--depth 5] [--horizon 420]
import { performance } from "node:perf_hooks";
import { makeWorld } from "../../../../scripts/e2e/routetool/kernel.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BEAM = Number(argOf("beam", "24"));
const DEPTH = Number(argOf("depth", "5"));
const HORIZON = Number(argOf("horizon", "420"));

const NONE = { up: false, left: false, right: false };
// 联合原语词汇表（同原语同时作用于 fb/wg；fb→右向 / wg→左向语义由目标函数塑形）
const PRIMS = [];
for (const k of [10, 30, 60]) {
  PRIMS.push({ name: `idle${k}`, gen: () => Array.from({ length: k }, () => ({ ...NONE })) });
  for (const dir of ["left", "right"]) {
    PRIMS.push({
      name: `hold-${dir}-${k}`,
      gen: () => Array.from({ length: k }, () => ({ ...NONE, [dir]: true })),
    });
    PRIMS.push({
      name: `hop-${dir}-${k}`, // 跳+dir 漂 12 帧后保持 dir
      gen: () => [
        ...Array.from({ length: 12 }, () => ({ ...NONE, up: true, [dir]: true })),
        ...Array.from({ length: Math.max(k, 40) }, () => ({ ...NONE, [dir]: true })),
      ],
    });
  }
}

// 一次展开 = 从头重放（确定性内核，无状态克隆手段下的标准做法）
function rollout(seq) {
  const w = makeWorld("forest_01");
  const doors = { fb: w.doors.fireboy.pos.x, wg: w.doors.watergirl.pos.x };
  let f = 0, deathF = -1;
  for (const prim of seq) {
    for (const inp of prim.gen()) {
      if (f >= HORIZON) break;
      w.step(1 / 60, { fireboy: inp, watergirl: inp }); // 同输入双角色（对称探索）
      const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
      if (a.dead || a.dying || b.dead || b.dying) { deathF = f; break; }
      f++;
    }
    if (deathF >= 0 || f >= HORIZON) break;
  }
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  const score =
    -Math.abs(a.x - doors.fb) - Math.abs(b.x - doors.wg)
    - (deathF >= 0 ? 100000 : 0)
    + (w.phase === "won" ? 1000000 : 0);
  return { score, fb: +a.x.toFixed(0), wg: +b.x.toFixed(0), deathF, won: w.phase === "won" };
}

const t0 = performance.now();
let beam = [{ seq: [], ...rollout([]) }];
let evals = beam.length;
for (let d = 0; d < DEPTH; d++) {
  const cands = [];
  for (const node of beam) {
    for (const prim of PRIMS) {
      const seq = [...node.seq, prim];
      cands.push({ seq, ...rollout(seq) });
      evals++;
    }
  }
  cands.sort((x, y) => y.score - x.score);
  beam = cands.slice(0, BEAM);
  console.log(`depth ${d + 1}: evals=${evals} best=${beam[0].score.toFixed(0)} path=${beam[0].seq.map((p) => p.name).join("→")} fb.x=${beam[0].fb} wg.x=${beam[0].wg}${beam[0].deathF >= 0 ? ` DEATH@${beam[0].deathF}` : ""}${beam[0].won ? " WON" : ""}`);
}
const ms = performance.now() - t0;
console.log(JSON.stringify({ beam: BEAM, depth: DEPTH, horizon: HORIZON, evals, wallMs: +ms.toFixed(0), evalsPerSec: +(evals / (ms / 1000)).toFixed(1), best: beam[0].seq.map((p) => p.name) }));

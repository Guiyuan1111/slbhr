// r15f 刀锋验尸：对指定 {side,#idx,+d} 正向致命项，跑 nominal vs slipped，
// 输出死亡帧、死亡位置、死亡前后机制状态与两人轨迹散点，定位"谁杀的"。
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/autopsy.mjs [route路径] "wg:11:1,wg:13:1,wg:64:1,wg:70:1,wg:70:3"
import { readFileSync } from "node:fs";
import { makeWorld, expandFlat } from "../../scripts/e2e/routetool/kernel.mjs";

const path = process.argv[2] ?? "scripts/e2e/inputs/routes/forest_15.json";
const spec = process.argv[3] ?? "";
const doc = JSON.parse(readFileSync(path, "utf8"));

function runShifted(side, idx, d) {
  const T = { fb: doc.fb.map((e) => ({ ...e })), wg: doc.wg.map((e) => ({ ...e })) };
  if (side && d) T[side][idx].f += d;
  const ins = expandFlat(T.fb, T.wg, doc.totalFrames);
  const w = makeWorld(doc.level);
  const trace = [];
  let res = null;
  for (let f = 0; f < doc.totalFrames; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    trace.push({ f, fb: [fb.x, fb.y], wg: [wg.x, wg.y], ph: w.phase });
    if (fb.dead || wg.dead || fb.dying || wg.dying) { res = { won: false, deathF: f, who: fb.dying || fb.dead ? "fb" : "wg" }; break; }
    if (w.phase === "won") { res = { won: true, winF: f }; break; }
  }
  return { res: res ?? { won: false, deathF: -1 }, trace, world: w };
}

for (const item of spec.split(",").filter(Boolean)) {
  const [side, idx, d] = item.split(":");
  const nom = runShifted(null, 0, 0);
  const slip = runShifted(side, Number(idx), Number(d));
  console.log(`\n===== ${side}#${idx}@f${doc[side][idx].f}+${d} =====`);
  console.log(`nominal: ${JSON.stringify(nom.res)}`);
  console.log(`slip   : ${JSON.stringify(slip.res)}`);
  if (slip.res.won) { console.log("slip 仍 WIN（与 poscan 不符？存疑）"); continue; }
  const df = slip.res.deathF;
  const b0 = doc[side][idx].f;
  // 发散点：滑版轨迹与名义轨迹首处持续 >8px
  let div = -1;
  for (let k = Math.max(0, b0 - 5); k < Math.min(nom.trace.length, slip.trace.length) - 3; k++) {
    const key = side === "fb" ? "fb" : "wg";
    const dv = Math.max(Math.abs(nom.trace[k][key][0] - slip.trace[k][key][0]), Math.abs(nom.trace[k][key][1] - slip.trace[k][key][1]));
    const dv2 = Math.max(Math.abs(nom.trace[k + 3][key][0] - slip.trace[k + 3][key][0]), Math.abs(nom.trace[k + 3][key][1] - slip.trace[k + 3][key][1]));
    if (dv > 8 && dv2 > 8) { div = k; break; }
  }
  console.log(`首发散 f${div}（事件帧 b0=f${b0}，death f${df}，${slip.res.who} 死）`);
  const anchor = div > 0 ? div : df;
  const lo = Math.max(0, anchor - 40), hi = df < 0 ? anchor + 240 : Math.min(df, anchor + 240);
  for (let k = lo; k <= hi; k += 10) {
    const n = nom.trace[Math.min(k, nom.trace.length - 1)], s = slip.trace[Math.min(k, slip.trace.length - 1)];
    console.log(`f${k} nom fb(${n.fb[0].toFixed(0)},${n.fb[1].toFixed(0)}) wg(${n.wg[0].toFixed(0)},${n.wg[1].toFixed(0)}) | slip fb(${s.fb[0].toFixed(0)},${s.fb[1].toFixed(0)}) wg(${s.wg[0].toFixed(0)},${s.wg[1].toFixed(0)})`);
  }
  const m = slip.world.mechSnapshot();
  console.log(`death 机制: levers=${m.levers.map((l) => l.state).join(",")} pushers=${m.pushers.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(";")} platforms=${m.platforms.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(";")}`);
}

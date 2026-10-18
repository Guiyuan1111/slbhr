/**
 * rotcheck 场景终录：B/C 全序列 θ(t) 落盘 + 死亡窗口内逐帧残差。
 *  B: forest_02 h0，f60 空投 fb 板东端（死亡@f184 截止→跑 190）
 *  C: forest_12 h2，f60 空投 wg 板东端（死亡@f194 截止→跑 200）
 */
import { writeFileSync } from "node:fs";
import { runOracle, runKernel, templeId } from "./rotlib.mjs";

const log = (m) => console.log(`[final] ${m}`);

async function one(tag, levelFile, level, acts, frames) {
  const id = templeId(levelFile);
  log(`${tag}: oracle ${frames}f ...`);
  const o = await runOracle({ levelId: id, levelFile, frames, actions: acts, drainEvery: 100 });
  const lose = o.marks.lose ?? frames;
  log(`${tag}: oracle 完成 lose@${o.marks.lose ?? "-"} 采样=${o.samples.length}`);
  const k = await runKernel({ level, frames, dtMs: o.samples.map((s) => s.e), actions: acts });
  // 窗口内逐帧残差（≤ lose）
  const win = Math.min(lose, o.samples.length, k.length);
  const rows = [];
  for (let i = 0; i < win; i++) {
    const os = o.samples[i], ks = k[i];
    rows.push({
      f: i,
      dPers: Math.max(Math.abs(os.fb[0] - ks.fb[0]), Math.abs(os.fb[1] - ks.fb[1]), Math.abs(os.wg[0] - ks.wg[0]), Math.abs(os.wg[1] - ks.wg[1])),
      dAng: os.hang.map((h, j) => h[2] - ks.hang[j][2]),
      ang: os.hang.map((h) => h[2]),
      kAng: ks.hang.map((h) => h[2]),
      dXY: os.hang.map((h, j) => Math.max(Math.abs(h[0] - ks.hang[j][0]), Math.abs(h[1] - ks.hang[j][1]))),
    });
  }
  const abs = (arr) => arr.map(Math.abs);
  const flat = (sel) => rows.flatMap((r) => abs(sel(r)));
  const q = (arr, p) => [...arr].sort((a, b) => a - b)[Math.floor(p * (arr.length - 1))];
  const dAngAll = flat((r) => r.dAng);
  const st = {
    framesCompared: win,
    loseAt: o.marks.lose ?? null,
    dPers: { max: Math.max(...flat((r) => [r.dPers])), median: q(flat((r) => [r.dPers]), 0.5) },
    dAngDeg: { max: Math.max(...dAngAll) * (180 / Math.PI), median: q(dAngAll, 0.5) * (180 / Math.PI), p99: q(dAngAll, 0.99) * (180 / Math.PI) },
    dXYpx: { max: Math.max(...flat((r) => r.dXY)), median: q(flat((r) => r.dXY), 0.5) },
    firstDivergenceF: rows.findIndex((r) => r.dAng.some((d) => Math.abs(d) > 1e-6)),
    lastDivergenceDeg: Math.max(...abs(rows[win - 1]?.dAng ?? [0])) * (180 / Math.PI),
  };
  writeFileSync(`TEMP/rotcheck/final-${tag}.json`, JSON.stringify({ acts, stats: st, dtMs: o.samples.slice(0, win).map((s) => s.e), rows }, null, 0));
  log(`${tag} 统计: ${JSON.stringify(st)}`);
  log(`${tag} → TEMP/rotcheck/final-${tag}.json`);
}

await one("b", "forest/levels/forest_02.json", "forest_02", [
  { f: 60, role: "pers1", x: 435.2, y: 340 },
], 190);
await one("c", "forest/levels/forest_12.json", "forest_12", [
  { f: 60, role: "pers2", x: 675.2, y: 636 },
], 200);
process.exit(0);

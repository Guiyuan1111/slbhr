/**
 * rotcheck 场景 B/C：角色驱动旋转对拍。
 *  B: forest_02 h0（384,408 板心，fullRotation）——f60 空投 fb 至板东端上方，f360 送回出生点；900 帧。
 *  C: forest_12 h2（624,704 板心，fullRotation）——f60 空投 wg 至板东端上方，f600 送回出生点；1800 帧。
 * 产物：TEMP/rotcheck/scen-{b,c}.json（oracle/kernel 序列 + 残差统计）。
 */
import { writeFileSync } from "node:fs";
import { runOracle, runKernel, templeId } from "./rotlib.mjs";

const log = (m) => console.log(`[scen] ${m}`);

function stats(os, ks, frames) {
  const res = [];
  for (let i = 0; i < Math.min(os.length, ks.length); i++) {
    const o = os[i], k = ks[i];
    res.push({
      dPers: Math.max(Math.abs(o.fb[0] - k.fb[0]), Math.abs(o.fb[1] - k.fb[1]), Math.abs(o.wg[0] - k.wg[0]), Math.abs(o.wg[1] - k.wg[1])),
      dHang: o.hang.map((h, j) => ({
        dxy: Math.max(Math.abs(h[0] - k.hang[j][0]), Math.abs(h[1] - k.hang[j][1])),
        dAng: Math.abs(h[2] - k.hang[j][2]),
        dVel: Math.max(Math.abs(h[3] - k.hang[j][3]), Math.abs(h[4] - k.hang[j][4])),
      })),
    });
  }
  const q = (arr, p) => [...arr].sort((a, b) => a - b)[Math.floor(p * (arr.length - 1))];
  const allAng = res.flatMap((r) => r.dHang.map((h) => h.dAng));
  const allXy = res.flatMap((r) => r.dHang.map((h) => h.dxy));
  const allVel = res.flatMap((r) => r.dHang.map((h) => h.dVel));
  const pers = res.map((r) => r.dPers);
  return {
    framesCompared: res.length,
    pers: { max: Math.max(...pers), median: q(pers, 0.5), p99: q(pers, 0.99) },
    hangXY: { max: Math.max(...allXy), median: q(allXy, 0.5), p99: q(allXy, 0.99) },
    hangAng: { max: Math.max(...allAng), median: q(allAng, 0.5), p99: q(allAng, 0.99) },
    hangVel: { max: Math.max(...allVel), median: q(allVel, 0.5), p99: q(allVel, 0.99) },
    firstAngOver: (() => { const i = res.findIndex((r) => r.dHang.some((h) => h.dAng > 1e-6)); return i; })(),
  };
}

// ---------------- 场景 B
{
  const levelFile = "forest/levels/forest_02.json";
  const id = templeId(levelFile);
  const acts = [
    { f: 60, role: "pers1", x: 435.2, y: 340 },   // fb → h0 东端上方（板心 384,408，半长 51.2px）
    { f: 360, role: "pers1", x: 72, y: 864 },     // 送回出生点（落地地面）
  ];
  log("B: oracle forest_02 900f ...");
  const o = await runOracle({ levelId: id, levelFile, frames: 900, actions: acts, drainEvery: 300 });
  log(`B: oracle 完成 采样=${o.samples.length} marks=${JSON.stringify(o.marks)}`);
  log("B: kernel 回放 ...");
  const k = await runKernel({ level: "forest_02", frames: 900, dtMs: o.samples.map((s) => s.e), actions: acts.map((a) => ({ ...a, role: a.role === "pers1" ? "pers1" : a.role })) });
  const st = stats(o.samples, k, 900);
  log(`B 统计: ${JSON.stringify(st, null, 1)}`);
  // 采样曲线（每 30 帧）：板 0 角度对
  const curve = [];
  for (let i = 0; i < Math.min(o.samples.length, k.length); i += 30) {
    curve.push({ f: i, oracle: +o.samples[i].hang[0][2].toFixed(5), kernel: +k[i].hang[0][2].toFixed(5) });
  }
  writeFileSync("TEMP/rotcheck/scen-b.json", JSON.stringify({ acts, oracleMarks: o.marks, e: o.samples.map((s) => s.e), stats: st, curve }, null, 1));
  log("B → TEMP/rotcheck/scen-b.json");
}

// ---------------- 场景 C
{
  const levelFile = "forest/levels/forest_12.json";
  const id = templeId(levelFile);
  const acts = [
    { f: 60, role: "pers2", x: 675.2, y: 636 },   // wg → h2 东端上方（板心 624,704）
    { f: 600, role: "pers2", x: 1152, y: 128 },   // 送回 wg 出生点
  ];
  log("C: oracle forest_12 1800f ...");
  const o = await runOracle({ levelId: id, levelFile, frames: 1800, actions: acts, drainEvery: 400 });
  log(`C: oracle 完成 采样=${o.samples.length} marks=${JSON.stringify(o.marks)}`);
  log("C: kernel 回放 ...");
  const k = await runKernel({ level: "forest_12", frames: 1800, dtMs: o.samples.map((s) => s.e), actions: acts });
  const st = stats(o.samples, k, 1800);
  log(`C 统计: ${JSON.stringify(st, null, 1)}`);
  const curve = [];
  for (let i = 0; i < Math.min(o.samples.length, k.length); i += 60) {
    curve.push({ f: i, oracle: +o.samples[i].hang[2][2].toFixed(5), kernel: +k[i].hang[2][2].toFixed(5) });
  }
  writeFileSync("TEMP/rotcheck/scen-c.json", JSON.stringify({ acts, oracleMarks: o.marks, e: o.samples.map((s) => s.e), stats: st, curve }, null, 1));
  log("C → TEMP/rotcheck/scen-c.json");
}
process.exit(0);

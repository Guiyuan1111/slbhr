// r15f 诊断探针：仅扫 +1/+2/+3 正向致命（MC slip 模型只有正向；负向致命不影响 MC/真机门禁）
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/poscan.mjs [route路径] [jobs=7]
// 依据: scripts/e2e/mc.mjs slip() — r<0.02→+1, r<0.026→+2, r<0.028→+3, 其余 0
import { readFileSync } from "node:fs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const path = process.argv[2] ?? "scripts/e2e/inputs/routes/forest_15.json";
const JOBS = Number(process.argv[3] ?? "7");
const doc = JSON.parse(readFileSync(path, "utf8"));
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const pool = new ScanPool(JOBS);
const t0 = Date.now();
const base = await pool.run(doc.level, { totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg });
console.log(`基线: ${base.won ? "WIN" : "DEAD @f" + base.deathF}`);
const OFFS = [1, 2, 3];
const jobs = [];
for (const side of ["fb", "wg"])
  for (let i = 0; i < doc[side].length; i++)
    for (const d of OFFS) {
      const T = clone(doc);
      T[side][i].f += d;
      jobs.push({ side, i, f: doc[side][i].f, d, route: { totalFrames: doc.totalFrames, fb: T.fb, wg: T.wg } });
    }
const rs = await Promise.all(jobs.map((j) => pool.run(doc.level, j.route).then((r) => ({ ...j, won: r.won })).catch(() => ({ ...j, won: false, err: true }))));
pool.close();
const fatal = rs.filter((x) => !x.won);
// MC 期望失败率: 独立近似 Σ P(slip=d)
const P = { 1: 0.02, 2: 0.006, 3: 0.002 };
let expFail = 0;
for (const x of fatal) expFail += P[x.d];
console.log(`正向 +1/+2/+3 fatal: ${fatal.length}/${jobs.length}（${((Date.now() - t0) / 1000).toFixed(0)}s） MC期望失败率≈${(100 * expFail).toFixed(1)}% → MC≈${(100 - 100 * expFail).toFixed(1)}%（独立近似,下界偏乐观）`);
for (const x of fatal) console.log(`  ${x.side}#${x.i}@f${x.f}+${x.d}${x.err ? " (worker错误)" : ""}`);
process.exit(0);

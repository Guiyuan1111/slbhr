// 路线产线·±Nf 致命表打印机：ScanPool 并行全扫，逐事件逐方向列出致命项（含 ±d），供硬化前后复核与预移迭代决策。用法：node scripts/e2e/routetool/scan.mjs [route路径] [scan深度=1] [jobs=10]
import { readFileSync } from "node:fs";
import { ScanPool } from "./pool.mjs";

const path = process.argv[2] ?? "scripts/e2e/inputs/routes/forest_01.json";
const SCAN = Number(process.argv[3] ?? "1");
const JOBS = Number(process.argv[4] ?? "10");
const doc = JSON.parse(readFileSync(path, "utf8"));
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const pool = new ScanPool(JOBS);
const t0 = Date.now();
const base = await pool.run(doc.level, { totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg });
console.log(`基线: ${base.won ? "WIN" : "DEAD @f" + base.deathF}`);
const jobs = [];
for (const side of ["fb", "wg"])
  for (let i = 0; i < doc[side].length; i++)
    for (let d = -SCAN; d <= SCAN; d++) {
      if (d === 0) continue;
      const T = clone(doc);
      T[side][i].f += d;
      jobs.push({ side, i, f: doc[side][i].f, d, route: { totalFrames: doc.totalFrames, fb: T.fb, wg: T.wg } });
    }
const rs = await Promise.all(
  jobs.map((j) =>
    pool
      .run(doc.level, j.route)
      .then((r) => ({ ...j, won: r.won }))
      .catch(() => ({ ...j, won: false, err: true })),
  ),
);
pool.close();
const fatal = rs.filter((x) => !x.won);
console.log(`±${SCAN}f fatal: ${fatal.length} / ${jobs.length}（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
for (const x of fatal) console.log(`  ${x.side}#${x.i}@f${x.f}${x.d > 0 ? "+" : ""}${x.d}${x.err ? " (worker错误)" : ""}`);
process.exit(0);

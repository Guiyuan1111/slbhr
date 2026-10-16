// auto-design 槽·E2：已绿路线 ±Nf 单事件扰动 fatal 率基线（真机鲁棒口径的内核侧数字）。
// 用法: cd gyのFW && node --import tsx note/research/2026-10-autoplay/tools/perturb.mjs [--route scripts/e2e/inputs/routes/forest_01.json] [--max 2] [--jobs 7]
// 脚本用"向上找 package.json"定位仓库根，仓库内任意 cwd 可运行。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { ScanPool } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "pool.mjs")).href);
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const routePath = resolve(ROOT, argOf("route", "scripts/e2e/inputs/routes/forest_01.json"));
const MAXD = Number(argOf("max", "2"));
const JOBS = Number(argOf("jobs", "7"));

const doc = JSON.parse(readFileSync(routePath, "utf8"));
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const pool = new ScanPool(JOBS);

const t0 = Date.now();
const base = await pool.run(doc.level, { totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg });
console.log(`基线: ${base.won ? `WIN @f${base.winF}` : "DEAD @f" + base.deathF}`);

const jobs = [];
for (let d = 1; d <= MAXD; d++)
  for (const side of ["fb", "wg"])
    for (let i = 0; i < doc[side].length; i++)
      for (const dir of [-d, d]) {
        const T = clone(doc);
        T[side][i].f += dir;
        jobs.push({ d, side, i, f: doc[side][i].f, dir, route: { totalFrames: doc.totalFrames, fb: T.fb, wg: T.wg } });
      }
const rs = await Promise.all(
  jobs.map((j) =>
    pool.run(doc.level, j.route).then((r) => ({ ...j, won: r.won, deathF: r.deathF })).catch(() => ({ ...j, won: false, err: true })),
  ),
);
pool.close();
const wallS = (Date.now() - t0) / 1000;

const result = { route: doc.source?.slice(0, 80) ?? routePath, level: doc.level, events: { fb: doc.fb.length, wg: doc.wg.length }, jobs: jobs.length, wallS: +wallS.toFixed(1), base: { won: base.won, winF: base.winF ?? null }, byD: {} };
for (let d = 1; d <= MAXD; d++) {
  const sub = rs.filter((x) => x.d === d);
  const fatal = sub.filter((x) => !x.won);
  result.byD[d] = {
    total: sub.length,
    fatal: fatal.length,
    rate: +(fatal.length / sub.length).toFixed(4),
    fatalList: fatal.map((x) => ({ side: x.side, i: x.i, f: x.f, dir: x.dir, deathF: x.deathF ?? null, err: !!x.err })),
  };
  console.log(`±${d}f fatal: ${fatal.length}/${sub.length} (${(100 * fatal.length / sub.length).toFixed(1)}%)`);
}
console.log(`wall=${wallS.toFixed(0)}s jobs=${JOBS} → ${(jobs.length / wallS).toFixed(1)} 回跑/s`);
writeFileSync(new URL("./perturb-result.json", import.meta.url), JSON.stringify(result, null, 1));
console.log("结果已写 perturb-result.json");
process.exit(0);

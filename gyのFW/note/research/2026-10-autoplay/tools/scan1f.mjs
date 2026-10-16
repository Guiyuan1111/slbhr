// 全量 ±1f 扰动扫描（诊断用）：记录每条 fatal 的扰动帧与死亡帧，区分扰动点分布与死亡点分布
// 用法：node --import tsx TEMP/autobuild/scan1f.mjs [routes路径] [--d 1] [--jobs 9]
import { pathToFileURL } from "node:url";
import { join, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
const ROOT = resolve(import.meta.dirname, "../..");
const argOf = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const ROUTE = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2]
  : join(ROOT, "scripts", "e2e", "inputs", "routes", "forest_01.autosearch.json");
const D = Number(argOf("d", "1")), JOBS = Number(argOf("jobs", "9"));
const doc = JSON.parse(readFileSync(ROUTE, "utf8"));
const { ScanPool } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "pool.mjs")).href);
const pool = new ScanPool(JOBS);
const jobs = [];
for (const side of ["fb", "wg"]) for (let i = 0; i < doc[side].length; i++) for (const dir of [-D, D]) jobs.push({ side, i, f: doc[side][i].f, dir });
const rs = await Promise.all(jobs.map((j) => {
  const T = { fb: doc.fb.map((e) => ({ ...e })), wg: doc.wg.map((e) => ({ ...e })) };
  T[j.side][j.i].f += j.dir;
  return pool.run(doc.level, { totalFrames: doc.totalFrames, fb: T.fb, wg: T.wg }).then((r) => ({ ...j, won: r.won, deathF: r.deathF ?? -1 })).catch(() => ({ ...j, won: false, deathF: -1, err: true }));
}));
pool.close();
const fatal = rs.filter((x) => !x.won);
const bucket = (arr, key, w) => { const m = new Map(); for (const x of arr) { const b = Math.floor((x[key] < 0 ? 99999 : x[key]) / w) * w; m.set(b, (m.get(b) ?? 0) + 1); } return [...m].sort((a, b) => a[0] - b[0]); };
console.log(`route=${ROUTE}`);
console.log(`events fb=${doc.fb.length} wg=${doc.wg.length} total=${doc.fb.length + doc.wg.length}  jobs=${jobs.length} fatal=${fatal.length} rate=${(fatal.length / jobs.length).toFixed(3)}`);
console.log("fatal 按【扰动帧】分桶(200f):", JSON.stringify(bucket(fatal, "f", 200)));
console.log("fatal 按【死亡帧】分桶(200f):", JSON.stringify(bucket(fatal.filter(x => x.deathF >= 0), "deathF", 200)), " deathF=-1(未死未胜):", fatal.filter(x => x.deathF < 0).length);
const bySeg = (f) => f < 378 ? "S0a" : f < 620 ? "S0b" : f < 830 ? "S1" : f < 1010 ? "S2" : f < 1180 ? "S3" : f < 1320 ? "S4" : f < 1470 ? "S5" : f < 1607 ? "S6" : "S7";
const segTab = new Map();
for (const x of rs) { const s = bySeg(x.f); const o = segTab.get(s) ?? { n: 0, fatal: 0 }; o.n++; if (!x.won) o.fatal++; segTab.set(s, o); }
console.log("按扰动事件所属段:", JSON.stringify([...segTab].map(([s, o]) => `${s}:${o.fatal}/${o.n}`)));
const dTab = new Map();
for (const x of fatal) { const s = x.deathF >= 0 ? bySeg(x.deathF) : "无死"; dTab.set(s, (dTab.get(s) ?? 0) + 1); }
console.log("死亡点所属段:", JSON.stringify([...dTab].sort()));
console.log("fatal 明细(全部):", JSON.stringify(fatal.map(({ side, i, f, dir, deathF }) => ({ side, i, f, dir, deathF }))));
